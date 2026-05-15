# Playto Payout Engine — Complete Checklist for Claude Code

Here's an exhaustive, structured checklist you can pass directly to Claude Code. It covers every requirement, technical constraint, and grading criterion from the challenge.

---

## 🏗️ PROJECT STRUCTURE & SETUP

- [ ] Django project named something like `playto_payout` with a `payouts` app
- [ ] React frontend (separate folder or integrated) with Tailwind CSS
- [ ] PostgreSQL as the database (NOT SQLite — `select_for_update` won't work on SQLite)[1]
- [ ] Celery configured with Redis (or RabbitMQ) as broker for background jobs — do NOT fake it with sync code
- [ ] Celery Beat for periodic task scheduling (retry stuck payouts)
- [ ] `requirements.txt` / `pyproject.toml` with all dependencies
- [ ] `docker-compose.yml` (optional bonus) for Postgres + Redis + Django + Celery
- [ ] Seed script (`python manage.py seed`) to populate 2–3 merchants with credit history
- [ ] Clean commit history (not one giant commit — show progression)

---

## 💰 MERCHANT LEDGER MODEL

- [ ] All money amounts stored as `BigIntegerField` in **paise** (1 INR = 100 paise) — **NO FloatField, NO DecimalField**
- [ ] A `LedgerEntry` model (or similar) with fields: `merchant` (FK), `type` (credit/debit/hold/release), `amount_paise` (BigInteger), `description`, `reference` (FK to payout or null), `created_at`
- [ ] A `Merchant` model with `name`, `email`, `bank_account_id`, etc.
- [ ] Balance is **derived** from ledger entries using database aggregation — NOT stored as a mutable field on the Merchant model (or if cached, always verified against ledger sum)
- [ ] Balance calculation uses `django.db.models.Sum` with database-level aggregation — **NOT Python-level arithmetic on fetched rows**
- [ ] The invariant `SUM(credits) - SUM(debits) = displayed balance` must always hold
- [ ] Available balance = total credits - total debits - total holds (where holds are pending payouts)
- [ ] Held balance = sum of amounts in pending/processing payouts

---

## 📡 PAYOUT REQUEST API

- [ ] Endpoint: `POST /api/v1/payouts/`
- [ ] Accepts `Idempotency-Key` header (merchant-supplied UUID)
- [ ] Request body: `{ "amount_paise": <int>, "bank_account_id": "<string>" }`
- [ ] Creates payout in `pending` state
- [ ] Creates a `hold` ledger entry atomically (deducting from available balance)
- [ ] Returns the payout object with status, id, amount, timestamps
- [ ] Returns **exact same response** if called twice with the same idempotency key — no duplicate payout created[2]
- [ ] Rejects if `amount_paise` exceeds available balance
- [ ] Rejects if `amount_paise <= 0`
- [ ] Uses DRF serializers for validation
- [ ] Proper HTTP status codes: 201 Created, 409 Conflict (insufficient funds), 400 Bad Request, 422 if needed

---

## 🔒 CONCURRENCY CONTROL (MOST CRITICAL — THIS IS WHAT THEY GRADE)

- [ ] Use `select_for_update()` inside `transaction.atomic()` to lock the merchant's ledger rows (or a dedicated lock row) before checking balance[1][2]
- [ ] The pattern MUST be: **lock → read balance → check → deduct** all inside one atomic transaction
- [ ] Do NOT do: read balance in Python → check in Python → then write. This is the classic race condition they explicitly warn about
- [ ] Test scenario: merchant has ₹100, two simultaneous ₹60 requests → exactly ONE succeeds, the other is rejected cleanly
- [ ] The lock must be at the **database level**, not Python-level (no threading locks, no in-memory locks)
- [ ] Consider using `select_for_update()` on merchant row or on a dedicated `MerchantBalance` row as a serialization point
- [ ] Alternative approach: use `F()` expressions with a CHECK constraint (`balance >= 0`) so the DB rejects overdrafts — but `select_for_update` is cleaner and more explicit for this use case

---

## 🔑 IDEMPOTENCY

- [ ] `IdempotencyKey` model with: `key` (UUID), `merchant` (FK), `response_data` (JSONField), `status_code` (int), `created_at`
- [ ] Unique constraint on `(merchant, key)` — keys are scoped per merchant
- [ ] On incoming request: check if key exists for this merchant
  - If exists and response stored → return the stored response (same status code, same body)
  - If exists but still in-flight (no response yet) → return 409 Conflict or wait (handle the race between two identical simultaneous requests)
  - If not exists → proceed with payout creation
- [ ] Use `get_or_create` or catch `IntegrityError` on unique constraint to handle race between two identical simultaneous requests[2]
- [ ] Keys expire after **24 hours** — add a cleanup mechanism (management command or celery beat task)
- [ ] The idempotency check + payout creation must be inside the same atomic transaction to prevent races

---

## 🔄 STATE MACHINE

- [ ] Payout states: `pending`, `processing`, `completed`, `failed`
- [ ] Legal transitions ONLY:
  - `pending` → `processing`
  - `processing` → `completed`
  - `processing` → `failed`
- [ ] **Illegal transitions must be rejected** (e.g., `completed` → `pending`, `failed` → `completed`, anything backwards)
- [ ] Implement state validation in the model's `save()` method or a dedicated `transition_to(new_state)` method
- [ ] Store `previous_state` or check current state before allowing transition
- [ ] When transitioning to `failed`: return held funds to merchant balance **atomically** with the state transition (same DB transaction)
- [ ] When transitioning to `completed`: convert hold to a final debit entry (or just leave the hold as the debit)
- [ ] Add `retry_count` field on Payout model
- [ ] Add `last_processed_at` timestamp field

---

## ⚙️ BACKGROUND WORKER (Celery Tasks)

- [ ] `process_pending_payouts` task: picks up `pending` payouts, transitions to `processing`, simulates bank settlement
- [ ] Bank settlement simulation:
  - 70% chance → `completed`
  - 20% chance → `failed`
  - 10% chance → stays in `processing` (simulates hang)
- [ ] On success (`completed`): payout is final, ledger entry confirmed
- [ ] On failure (`failed`): held funds return to merchant balance atomically with state change
- [ ] **Retry logic for stuck payouts:**
  - Payouts stuck in `processing` for more than **30 seconds** → retry
  - **Exponential backoff** (e.g., retry at 30s, 60s, 120s)
  - **Max 3 attempts**
  - After 3 failed attempts → move to `failed` and return funds
- [ ] Use Celery Beat to periodically scan for stuck payouts (e.g., every 10-15 seconds)
- [ ] Each task processes payouts inside `transaction.atomic()` with proper locking
- [ ] Pass payout IDs to tasks, not model instances[3]

---

## 🖥️ REACT FRONTEND (Merchant Dashboard)

- [ ] Shows **available balance** (in ₹, converted from paise for display)
- [ ] Shows **held balance** (funds locked in pending/processing payouts)
- [ ] **Recent credits and debits** table (ledger entries)
- [ ] **Payout request form** with amount input and bank account selector
- [ ] **Payout history table** with columns: amount, status, created_at, updated_at
- [ ] **Live status updates** — use polling (every 2-5 seconds) or WebSocket
- [ ] Use Tailwind CSS for styling
- [ ] Merchant selector/switcher (since you have 2-3 seeded merchants)
- [ ] Error handling: show meaningful messages for insufficient funds, duplicate requests, etc.
- [ ] Format paise to rupees for display (divide by 100, show 2 decimal places)

---

## 🧪 TESTS (Minimum 2 Required)

### Test 1: Concurrency Test
- [ ] Create a merchant with a known balance (e.g., 10000 paise = ₹100)
- [ ] Fire two simultaneous payout requests for ₹60 (6000 paise) each using `threading` or `concurrent.futures`
- [ ] Assert: exactly one succeeds (201), exactly one fails (4xx)
- [ ] Assert: final balance = 10000 - 6000 = 4000 paise (not negative, not 10000)
- [ ] Assert: only one payout record exists in pending/processing state

### Test 2: Idempotency Test
- [ ] Send a payout request with `Idempotency-Key: <uuid>`
- [ ] Send the exact same request again with the same key
- [ ] Assert: both responses are identical (same payout ID, same status, same body)
- [ ] Assert: only ONE payout record exists in the database
- [ ] Assert: balance was only deducted once

### Bonus Tests:
- [ ] State machine: attempt illegal transition (e.g., completed → pending) and assert rejection
- [ ] Insufficient funds: request payout exceeding balance and assert rejection
- [ ] Expired idempotency key: assert key older than 24h is not reused

---

## 📄 EXPLAINER.md (THIS IS WHERE MOST CANDIDATES GET FILTERED OUT)

### 1. The Ledger
- [ ] Paste the exact balance calculation query (the ORM call or raw SQL)
- [ ] Explain why credits/debits are modeled this way (append-only, auditable, no mutable balance field)
- [ ] Explain why BigIntegerField and paise (avoid floating point, precision)

### 2. The Lock
- [ ] Paste the exact code block that prevents concurrent overdraft
- [ ] Name the database primitive: `SELECT ... FOR UPDATE` (PostgreSQL row-level lock)
- [ ] Explain: it blocks the second transaction until the first commits/rolls back

### 3. The Idempotency
- [ ] Explain: unique constraint on `(merchant_id, idempotency_key)` in the DB
- [ ] Explain: what happens if first request is still in-flight when second arrives (IntegrityError catch, or the lock serializes them)
- [ ] Explain: stored response is returned for duplicate keys

### 4. The State Machine
- [ ] Paste the code that blocks `failed` → `completed` (the transition validation)
- [ ] Show the allowed transitions dict/map
- [ ] Show where it raises an error on illegal transition

### 5. The AI Audit (BE HONEST)
- [ ] Find one real example where AI generated wrong code (bad lock scope, aggregation outside transaction, race in idempotency check, wrong Celery retry config)
- [ ] Paste the **wrong code** AI gave
- [ ] Paste what you **replaced it with** and why
- [ ] This is meant to show you understand the code, not that you're perfect

---

## 🚀 DEPLOYMENT

- [ ] Deploy to Railway / Render / Fly.io / Koyeb (free tier)
- [ ] Ensure PostgreSQL is provisioned (not SQLite)
- [ ] Ensure Redis is provisioned (for Celery)
- [ ] Ensure Celery worker is running (separate process/dyno)
- [ ] Ensure Celery Beat is running (for retry scanning)
- [ ] Seed the deployed database with test merchants and credit history
- [ ] Share the live URL in the submission form
- [ ] Test the live URL before submitting

---

## 📋 README.md

- [ ] Clear setup instructions (clone → install → configure DB → migrate → seed → run)
- [ ] Environment variables documented
- [ ] How to run the backend (`python manage.py runserver`)
- [ ] How to run Celery worker (`celery -A project worker -l info`)
- [ ] How to run Celery Beat (`celery -A project beat -l info`)
- [ ] How to run the frontend (`npm install && npm run dev`)
- [ ] How to run tests (`python manage.py test`)
- [ ] Live deployment URL

---

## ⚠️ COMMON PITFALLS TO AVOID

- [ ] **DO NOT use `DecimalField` or `FloatField` for money** — they explicitly said BigIntegerField in paise
- [ ] **DO NOT calculate balance in Python** by fetching all rows and summing — use DB-level `aggregate(Sum(...))`
- [ ] **DO NOT use Python threading locks for concurrency** — must be database-level locking
- [ ] **DO NOT skip the atomic transaction** around balance check + hold creation
- [ ] **DO NOT allow backward state transitions** — explicitly validate
- [ ] **DO NOT make Celery tasks synchronous** — they said "do not fake it with sync code"
- [ ] **DO NOT store balance as a mutable column** that you increment/decrement without ledger entries (or if you do, it must be backed by the ledger invariant)
- [ ] **DO NOT forget to return funds on failure** — this must be atomic with the state change to `failed`
- [ ] **DO NOT use SQLite for development** — `select_for_update` is silently ignored on SQLite[1]
- [ ] **DO NOT make one giant commit** — show clean git history with logical commits

---

## 🎁 OPTIONAL BONUSES (Pick 1-2 max)

- [ ] `docker-compose.yml` — Postgres + Redis + Django + Celery + React in one command
- [ ] Event sourcing — ledger as event log, balance as projection
- [ ] Webhook delivery with retries — notify merchants of payout status changes
- [ ] Audit log — track every state change, who/what triggered it, timestamps

---

## 🏆 PRIORITY ORDER (What to build first)

1. **Models** — Merchant, LedgerEntry, Payout, IdempotencyKey
2. **Seed script** — 2-3 merchants with credit history
3. **Balance calculation** — DB-level aggregation query
4. **Payout API with concurrency + idempotency** — the core endpoint
5. **State machine** — transition validation
6. **Celery worker** — process payouts with simulated settlement
7. **Retry logic** — stuck payout detection + exponential backoff
8. **React dashboard** — display data + payout form
9. **Tests** — concurrency test + idempotency test
10. **EXPLAINER.md** — answer all 5 questions
11. **Deploy** — Railway/Render with Postgres + Redis
12. **README.md** — setup docs

This ordering ensures you nail the hard parts (money integrity, concurrency, idempotency) first, which is what they explicitly grade on, before moving to the UI and deployment.

Citations:
[1] https://nextgendjango.com/using-celery-with-django-for-background-tasks-a-practical-guide.html
[2] https://medium.com/@ranju.r/django-at-100m-rows-part-3-celery-concurrency-idempotency-distributed-locks-and-exactly-once-ac112a22159c
[3] https://oneuptime.com/blog/post/2026-01-26-django-celery-background-tasks/view

