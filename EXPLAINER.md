# Playto Pay — Comprehensive Explainer

this document consolidates every design and implementation decision from all markdown files in the project.

---

## 1) Architecture & Stack

### 1.1 Why This Stack
- **django + drf**: used for api layer and validation because it integrates tightly with postgresql transactions and provides built-in serialization/validation.
- **postgres** (not sqlite): required because `select_for_update()` only works on postgresql. sqlite silently ignores row-level locks, breaking concurrency safety tests.
- **celery + redis**: background worker and queue for async payout processing. workers run as separate processes so api stays fast.
- **celery beat**: periodic task scheduler for scanning stuck payouts and retry due jobs.
- **react + tailwind**: lightweight dashboard for visibility into balances, payouts, and ledger during testing.

### 1.2 Service Split
- api: handles validation, idempotency lookup, balance hold, payout creation
- worker: processes pending payouts, simulates settlement outcomes, handles retries
- beat: schedules periodic scans for stuck/due payouts
- frontend: merchant dashboard with balance display, payout history, ledger, activity log

### 1.3 Container Alignment
- verified postgres and redis container status before development.
- used `POSTGRES_HOST=127.0.0.1` with mapped ports to avoid `ident` auth issues.
- celery requires redis; without it, async processing and retries do not work.

---

## 2) Data Model & Money Handling

### 2.1 Why BigIntegerField in Paise
- all money amounts stored as `BigIntegerField` in **paise** (1 inr = 100 paise).
- **no floatfield, no decimalfield** — floating point causes precision errors in financial systems.
- amounts display converted to rupees (divide by 100) in ui.

### 2.2 Ledger as Source of Truth
- `ledgerentry` model is append-only (never updated or deleted).
- balance is **derived** from ledger entries using database aggregation with `django.db.models.Sum`.
- invariant: `sum(credits) - sum(debits) - sum(holds) = displayed balance`.
- available balance = total credits - total debits - total holds.
- held balance = sum of amounts in pending/processing payouts.

### 2.3 Balance Model
- `merchantbalance` has two balances: `available_balance_paise` and `held_balance_paise`.
- this makes reservation explicit — funds in `held` cannot be spent again until payout completes or fails.

### 2.4 Models Created
- `merchant`: id, name, email
- `merchantbalance`: merchant_id (fk), available_balance_paise, held_balance_paise, version
- `ledgerentry`: merchant_id, entry_type (credit, payout_hold, payout_release, payout_debit_final), amount_paise, payout_id, reference, created_at
- `bankaccount`: merchant_id, account_masked, ifsc, is_active
- `payout`: merchant_id, bank_account_id, amount_paise, status (pending, processing, completed, failed), attempt_count, next_retry_at, failure_reason, idempotency_key
- `idempotencykey`: merchant_id, key, request_hash, response_status_code, response_body, resource_type, resource_id, state (in_progress, completed), expires_at
- `payoutstatetransition`: payout_id, from_status, to_status, actor, metadata, created_at

---

## 3) Concurrency Control (Most Critical)

### 3.1 Why Row-Level Locking
- used `select_for_update()` inside `transaction.atomic()` to lock the merchant's balance row before checking balance.
- pattern: **lock → read balance → check → deduct** all inside one atomic transaction.
- **do not** read balance in python → check in python → then write. that is the classic race condition.

### 3.2 Test Scenario
- merchant has ₹100, two simultaneous ₹60 requests.
- exactly one succeeds (201), the other fails cleanly.
- final balance = ₹100 - ₹60 = ₹40 (not negative, not ₹100).
- only one payout record exists in pending/processing state.

### 3.3 Database Primitive
- `select_for_update()` is a postgresql row-level lock that blocks the second transaction until the first commits or rolls back.
- alternative approaches (check constraint, f() expressions) are less explicit for this use case.

---

## 4) Idempotency

### 4.1 Why Persisted Idempotency
- retries happen in real networks, so storing key + request hash is the safest way to avoid double debit.
- `idempotencykey` unique constraint on `(merchant_id, key)` — keys are scoped per merchant.

### 4.2 Idempotency Flow
1. extract `idempotency-key` header from request.
2. compute stable request hash from method, path, and body.
3. lookup `idempotencykey` by (merchant_id, key).
4. if found and not expired:
   - if state=completed: return cached response (same status code, same body).
   - if state=in_progress: return 409 conflict.
5. if not found:
   - create idempotency row in state=in_progress.
   - process request.
   - update idempotency row to state=completed with response snapshot.

### 4.3 TTL & Cleanup
- keys expire after **24 hours**.
- cleanup handled by celery beat task runs daily, deletes expired idempotency keys.

### 4.4 Race Between Identical Requests
- unique constraint on `(merchant, key)` catches race between two identical simultaneous requests.
- `get_or_create` or catch `integrityerror` handles this.

---

## 5) State Machine

### 5.1 Allowed Transitions
- `pending → processing` (worker picks up)
- `processing → completed` (settlement success)
- `processing → failed` (settlement failure or max retries)

### 5.2 Forbidden Transitions
- `completed → any state` (terminal)
- `failed → any state` (terminal)
- `processing → pending` (never go backwards)

### 5.3 Enforcement
- implemented in model `clean()` method.
- also enforced in serializer validation.
- worker logic checks current state before allowing transition.

### 5.4 Fund Release Atomicity
- when transitioning to `failed`: return held funds to merchant balance **atomically** with state transition (same db transaction).
- when transitioning to `completed`: convert hold to final debit entry.

---

## 6) Async Processing & Retry

### 6.1 Why Async Workers
- payout completion can be slow or flaky, so worker isolation keeps api latency low.
- api stays fast: validate → reserve funds → record intent → enqueue job → return.

### 6.2 Worker Setup
- `process_pending_payouts` task: picks pending payouts, transitions to processing, simulates settlement.
- `retry_stuck_payouts` task: picks timed-out or due retries and requeues them.
- each task processes inside `transaction.atomic()` with proper locking.

### 6.3 Settlement Simulation
- 70% chance → `completed`
- 20% chance → `failed` (release held funds)
- 10% chance → stays processing (simulates hang)

### 6.4 Retry Logic
- payouts stuck in `processing` for more than **30 seconds** → retry.
- **exponential backoff**: retry at 30s, 60s, 120s (attempt 1, 2, 3).
- **max 3 attempts** after which mark failed and release funds.
- celery beat schedules periodic scan for stuck payouts (every 10-15 seconds).

### 6.5 Failure Handler
- on failure: update payout status to failed, release held funds atomically, create ledger entry for payout_release.

---

## 7) API Design

### 7.1 Endpoints
- `post /api/v1/payouts`: create payout with idempotency
- `get /api/v1/payouts`: list with filters
- `get /api/v1/payouts/<id>`: detail
- `get /api/v1/balance`: current balance
- `get /api/v1/ledger`: ledger entries
- `post /api/v1/credits`: simulate incoming payment
- `get /api/v1/merchants`: list merchants (for selector)
- `get /api/v1/activity-log`: aggregated events from payout transitions, ledger, and idempotency

### 7.2 Headers
- `idempotency-key`: merchant-supplied uuid
- `x-merchant-id`: merchant identifier

### 7.3 Response Codes
- 201 created: payout created successfully
- 409 conflict: duplicate in progress or insufficient balance
- 400 bad request: validation error

---

## 8) Frontend Dashboard

### 8.1 Features
- displays **available balance** and **held balance** (converted to rupees).
- shows **payout history** table with status, amount, timestamps.
- shows **ledger entries** table.
- **payout creation form** with amount input and bank account selector.
- **merchant selector** dropdown for switching between merchants.
- **activity log** panel showing backend events.
- uses polling (every 2-5 seconds) for live status updates.

### 8.2 Why Selector-Based
- ui was previously pinned to one merchant via `vite_merchant_id`.
- added selector so multiple seeded merchants are visible for testing.

### 8.3 Why Activity Log
- surfaced backend events (payout state transitions, ledger entries, idempotency) in ui.
- keeps frontend logs consistent with actual backend state.

---

## 9) Seed Data

### 9.1 Expansion
- seeded 6 merchants total (loop-based for maintainability).
- each merchant gets a bank account and opening credit.
- refactored seeding into single list + loop.

---

## 10) Testing

### 10.1 Required Tests
- **concurrency test**: merchant with 10000 paise, two simultaneous 6000 paise requests, verify exactly one succeeds.
- **idempotency test**: send same request twice with same key, verify identical response and only one payout record.

### 10.2 Bonus Tests
- state machine: attempt illegal transition, verify rejection.
- insufficient funds: request payout exceeding balance, verify rejection.

---

## 11) Deployment

### 11.1 Platform
- railway for deployment (chosen for free tier).
- unified root config `railway.json` with role-driven scripts.
- scripts select behavior by `service_role` (api, worker, beat, frontend).

### 11.2 Services
- postgresql provisioned (not sqlite).
- redis provisioned (for celery).
- django api running as api service.
- celery worker running as worker service.
- celery beat running as beat service.
- react frontend as frontend service.

---

## 12) Iteration Decisions (From changes.md & changes2.md)

### 12.1 Iteration 1 — Docker + Local Alignment
- fixed postgres container status and port mapping.
- confirmed backend env uses `postgresql_host=127.0.0.1`.
- started redis container for celery broker.
- validated backend processes: django api, celery worker, celery beat.

### 12.2 Iteration 2 — Readme Rewrite
- rewrote top-level `readme.md` to architecture-first format.
- added mermaid architecture diagram.
- focused on design decisions and rationale.

### 12.3 Iteration 3 — Backend Deep Dive
- created `backend/readme.md` as detailed backend deep dive.
- documented payout lifecycle, idempotency flow, state transitions, retry behavior.

### 12.4 Iteration 4 — Seed Data Expansion
- seeded 6 merchants.
- loop-based seeding for maintainability.

### 12.5 Iteration 5 — Merchant-Aware Dashboard
- added `get /api/v1/merchants` endpoint.
- updated frontend api client to accept per-request merchant id.
- dashboard renders merchant selector dropdown.
- payout form submits using selected merchant.

### 12.6 Iteration 6 — Activity Log in UI
- added `get /api/v1/activity-log` endpoint.
- creates activity log panel in frontend.
- shows events from `payoutstatetransition`, `ledgerentry`, `idempotencykey`.

### 12.7 Iteration 7 — Railway Consolidation
- created unified root `railway.json`.
- role-driven scripts: `railway/build.sh`, `railway/start.sh`.
- removed old per-service railway files.

### 12.8 Iteration 8 — Validation
- ran `python backend/manage.py check`.
- ran `npm run build`.

---

## 13) Common Pitfalls Avoided

- **did not use decimalfield or floatfield for money** — used bigintegerfield in paise.
- **did not calculate balance in python** — used db-level `aggregate(sum(...))`.
- **did not use python threading locks** — used database-level locking.
- **did not skip atomic transaction** — balance check + hold creation wrapped in same transaction.
- **did not allow backward state transitions** — explicitly validated.
- **did not forget to return funds on failure** — atomic with state change.
- **did not use sqlite** — postgresql required for `select_for_update`.
- **did not make one giant commit** — logical commits shown.

---

## 14) Key Files

- `backend/core/models.py`: all domain models
- `backend/core/services.py`: business logic (idempotency, balance hold/release, transitions)
- `backend/core/views.py`: api endpoints
- `backend/core/tasks.py`: celery tasks for async processing
- `backend/core/idempotency.py`: idempotency middleware
- `frontend/src/pages/dashboard.jsx`: main dashboard
- `frontend/src/components/payoutform.jsx`: payout creation form
- `frontend/src/components/activitylog.jsx`: activity log panel

---

## 15) Commands

```bash
# backend
python backend/manage.py migrate
python backend/manage.py seed_data
python backend/manage.py runserver
celery --app payouts worker --loglevel info
celery --app payouts beat --loglevel info

# frontend
cd frontend && npm install && npm run dev
```

---

this document consolidates all decisions from plan.md, explainer.md, execution_plan.md, changes.md, changes2.md, backend/readme.md, and readme.md into a single authoritative source.