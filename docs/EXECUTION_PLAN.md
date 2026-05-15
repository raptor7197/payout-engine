# PlaytoPay — Enhanced Plan & Execution Strategy

---

## Part A: Enhanced PLAN.md Additions

### 8.2 Flow Diagrams (ASCII)

#### Payout Request Flow
```
┌─────────────┐     ┌──────────────┐     ┌────────────────┐     ┌────────────────┐
│   Client    │────▶│  DRF View    │────▶│ Idempotency    │────▶│ Balance Check  │
│             │     │              │     │ Lookup         │     │ & Hold         │
└─────────────┘     └──────────────┘     └────────────────┘     └────────────────┘
                                                                    │
                        ┌───────────────────────────────────────────┘
                        ▼
              ┌────────────────┐     ┌────────────────┐     ┌────────────────┐
              │ Balance OK?    │────▶│ Create Payout  │────▶│ Enqueue Task   │
              │                │ NO  │ (pending)      │     │ (Celery)       │
              └────────────────┘     └────────────────┘     └────────────────┘
                    │
                   YES
                    │
                    ▼
          ┌────────────────┐
          │ 201 Created    │
          │ or 200 (dup)   │
          └────────────────┘
```

#### Async Worker Flow
```
┌────────────────┐     ┌────────────────┐     ┌────────────────┐
│  Celery Beat   │────▶│  Redis Queue  │────▶│ Worker Process │
│  (schedules)   │     │                │     │                │
└────────────────┘     └────────────────┘     └────────────────┘
                                                     │
                         ┌───────────────────────────┘
                         ▼
              ┌────────────────┐     ┌────────────────┐
              │ Simulate       │     │ Update Status  │
              │ Settlement     │────▶│ (completed/    │
              │ (70/20/10%)    │     │  failed)        │
              └────────────────┘     └────────────────┘
                         │
                    ┌────┴────┐
                    │ 10%     │
                    │ timeout │
                    └────┬────┘
                         ▼
              ┌────────────────┐     ┌────────────────┐
              │ Retry with     │────▶│ Max attempts    │
              │ exponential    │     │ reached?        │
              │ backoff        │     │                 │
              └────────────────┘     └────────────────┘
                                        │
                                       YES
                                        │
                                        ▼
                             ┌────────────────┐
                             │ Mark failed    │
                             │ Release funds  │
                             │ atomically     │
                             └────────────────┘
```

#### Fund Flow States
```
State: available=10000, held=0

[Request Payout 6000paise]
                    │
                    ▼
State: available=4000, held=6000, Payout: pending
                    │
                    ▼
         [Worker picks up]
                    │
                    ▼
State: available=4000, held=6000, Payout: processing
                    │
          ┌──────────┴──────────┐
          │                     │
     [SUCCESS 70%]        [FAILED 20%]
          │                     │
          ▼                     ▼
State: available=4000,    State: available=10000,
held=0, Payout: completed held=0, Payout: failed
(ledger: final debit)     (ledger: hold released)

                                   [TIMEOUT 10%]
                                        │
                                        ▼
                              [Retry #1 - backoff]
                                        │
                                  ┌─────┴─────┐
                               [SUCCESS]  [FAILED]
                                  │          │
                                  ▼          ▼
                            completed    [Retry #2]
                                              │
                                        ┌─────┴─────┐
                                     [SUCCESS]  [Retry #3]
                                                     │
                                               ┌─────┴─────┐
                                            [SUCCESS]  [FAIL/MAX]
                                                     │
                                                     ▼
                                              Mark failed
                                              Release funds
```

### 8.3 Multiple Scenario Analysis

#### Scenario 1: Normal Payout (Happy Path)
1. Merchant has 10000paise available, 0 held
2. POST /api/v1/payouts with amount=6000
3. Idempotency key check: new key, proceed
4. Balance check: 10000 >= 6000 ✓
5. Atomic transaction: create payout (pending), increment held_balance_paise, decrement available_balance_paise, create ledger entry
6. Return 201 with payout object
7. Celery task enqueued
8. Worker picks up, simulates success (70% probability)
9. Worker updates payout to completed, ledger entry for final debit
10. Final state: available=4000, held=0, payout=completed

#### Scenario 2: Concurrent Payout Race (100 + 60 + 60)
1. Merchant has 10000paise available, 0 held
2. Request A: POST payout 6000paise (idempotency key A)
3. Request B: POST payout 6000paise (idempotency key B) — arrives before A commits
4. DB transaction A: SELECT FOR UPDATE on MerchantBalance, balance=10000>=6000 ✓, UPDATE set available=4000,held=6000
5. DB transaction B: SELECT FOR UPDATE on MerchantBalance, balance=4000<6000 ✗ → REJECT with 400 error
6. Request C: POST payout 6000paise (idempotency key C) — arrives after A but before B
7. DB transaction C: SELECT FOR UPDATE on MerchantBalance, balance=4000>=6000? NO → balance is actually 4000 held (not available for new payouts until A completes or fails)
8. Actually careful: held balance means those funds are reserved. So C should see available=4000, which is < 6000, so C also fails.
9. Only one of A or B succeeds (whichever gets lock first)

**Critical invariant**: `SELECT FOR UPDATE` ensures only one concurrent request modifies balance at a time.

#### Scenario 3: Idempotent Retry (Same Request Sent Twice)
1. Client sends POST /api/v1/payouts with idempotency key "key-123"
2. Server creates idempotency record (state=in_progress), processes, returns 201
3. Client timeout, client resends same request with same key
4. Server finds existing key with state=completed, returns stored response (200, same body)
5. No new payout created. No duplicate fund hold.

**Edge case**: What if first request is still processing when retry arrives?
- Idempotency key state=in_progress
- Return 409 Conflict OR wait/polling (decide: return 409 immediately)

#### Scenario 4: Payout Failure & Fund Release
1. Payout in processing state (funds already held)
2. Simulated settlement returns failure (20% probability)
3. Worker executes atomic transaction:
   - UPDATE payout SET status=failed, failure_reason=...
   - UPDATE merchant_balance SET available+=amount, held-=amount
   - CREATE ledger entry (payout_release)
4. Merchant available balance restored

#### Scenario 5: Worker Timeout/Hung Payout (10%)
1. Payout picked up by worker, status=processing
2. Settlement simulation hangs (or >30s)
3. Worker has timeout detection (Celery task timeout)
4. On timeout: retry with exponential backoff
5. Attempt 2: same process, timeout again
6. Attempt 3: same process, timeout again
7. After max attempts: mark failed, release funds atomically

#### Scenario 6: Insufficient Balance
1. Merchant has 5000paise available
2. POST /api/v1/payouts with amount=6000
3. Balance check: 5000 < 6000
4. Return 400 Bad Request with error: "Insufficient balance"
5. No payout created, no funds held

#### Scenario 7: Bank Account Validation
1. POST /api/v1/payouts with bank_account_id that doesn't exist
2. Return 400 Bad Request: "Invalid bank account"
3. No payout created

#### Scenario 8: Idempotency Key Expiration
1. Merchant creates payout with key "expire-test", 24h TTL set
2. After 24h, key record expires/is cleaned up
3. New request with same key is treated as new request
4. Cleanup: Celery beat task runs daily, deletes expired idempotency keys

---

## Part B: Execution Plan

### Phase 1: Project Foundation (Setup)
- [ ] Initialize Django project with DRF
- [ ] Configure PostgreSQL with BIGINT fields
- [ ] Set up Celery with Redis broker
- [ ] Configure Tailwind + React frontend scaffold
- [ ] Write AGENTS.md with commands for this project

### Phase 2: Backend Core (Data Layer)
- [ ] Create Merchant model
- [ ] Create MerchantBalance model with version field
- [ ] Create LedgerEntry model (append-only)
- [ ] Create BankAccount model
- [ ] Create Payout model with status enum
- [ ] Create IdempotencyKey model
- [ ] Create PayoutStateTransition model
- [ ] Run migrations
- [ ] Create seed data script

### Phase 3: Ledger & Balance Logic
- [ ] Implement balance check with SELECT FOR UPDATE
- [ ] Implement atomic payout hold (available-, held+)
- [ ] Implement atomic payout release (available+, held-)
- [ ] Implement ledger entry creation
- [ ] Add admin property: balance == ledger.sum
- [ ] Write tests for balance invariants

### Phase 4: API Layer
- [ ] POST /api/v1/payouts with idempotency middleware
- [ ] GET /api/v1/payouts (list with filters)
- [ ] GET /api/v1/payouts/<id>
- [ ] GET /api/v1/balance
- [ ] GET /api/v1/ledger
- [ ] POST /api/v1/credits (simulate incoming payment)
- [ ] Authentication middleware (Bearer token)

### Phase 5: Async Worker
- [ ] Celery task: process_pending_payouts
- [ ] Simulated settlement logic (70/20/10)
- [ ] Timeout detection and retry logic
- [ ] Exponential backoff implementation
- [ ] Max attempts handling → fail + release
- [ ] Celery Beat schedule for polling

### Phase 6: Frontend
- [ ] Dashboard layout
- [ ] Balance display (available/held)
- [ ] Payout history table
- [ ] Create payout form
- [ ] Live status refresh (polling)
- [ ] Error handling UI

### Phase 7: Testing & Polish
- [ ] Concurrency test: 100+60+60 scenario
- [ ] Idempotency test: duplicate request
- [ ] State machine test: illegal transitions blocked
- [ ] Integration test: full happy path
- [ ] EXPLAINER.md with code snippets
- [ ] Deploy to render.com/Railway
- [ ] Verify live URL works

---

## Part C: Key Technical Decisions

### C.1 Row-Level Locking Strategy
```python
with transaction.atomic():
    balance = MerchantBalance.objects.select_for_update().get(merchant=merchant)
    if balance.available_balance_paise >= amount:
        # Atomic hold operation
```

### C.2 Idempotency Check Flow
```
1. Extract Idempotency-Key header
2. Lookup IdempotencyKey by (merchant_id, key)
3. If found and not expired:
   - If state=completed: return cached response
   - If state=in_progress: return 409 Conflict
4. If not found:
   - Create IdempotencyKey with state=in_progress
   - Process request
   - Update IdempotencyKey to completed with response
```

### C.3 State Machine Transitions
```
ALLOWED:
  pending → processing (worker picks up)
  processing → completed (settlement success)
  processing → failed (settlement failure OR max retries)

FORBIDDEN:
  completed → any state
  failed → any state
  processing → pending (never go backwards)

ENFORCED via:
  model.clean() for Django validation
  serializer validation
  worker logic must check current state before transition
```

### C.4 Fund Release Atomicity
```python
with transaction.atomic():
    payout = Payout.objects.select_for_update().get(id=payout_id)
    if payout.status != 'processing':
        return  # already handled
    
    payout.status = 'failed'
    payout.failure_reason = reason
    payout.save()
    
    balance = MerchantBalance.objects.select_for_update().get(merchant=payout.merchant)
    balance.available_balance_paise += payout.amount_paise
    balance.held_balance_paise -= payout.amount_paise
    balance.save()
    
    LedgerEntry.objects.create(
        merchant=payout.merchant,
        entry_type='payout_release',
        amount_paise=payout.amount_paise,
        payout=payout
    )
```

### C.5 Exponential Backoff
```
Attempt 1: immediate
Attempt 2: wait 5 seconds
Attempt 3: wait 25 seconds (5^2)
After 3 failures: mark failed
```

---

## Part D: File Structure

```
play-to-pay/
├── backend/
│   ├── playtopay/
│   │   ├── settings.py
│   │   ├── celery.py
│   │   └── urls.py
│   ├── core/
│   │   ├── models.py          # All domain models
│   │   ├── serializers.py
│   │   ├── views.py
│   │   ├── services.py        # Business logic
│   │   ├── idempotency.py     # Idempotency middleware
│   │   └── tasks.py           # Celery tasks
│   ├── manage.py
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── hooks/
│   │   └── App.tsx
│   └── package.json
├── PLAN.md
├── EXPLAINER.md
├── AGENTS.md
└── README.md
```

---

## Part E: Dependency Map

```
User Action
    │
    ▼
DRF View (payouts view)
    │
    ▼
Idempotency Middleware ─────────────────────┐
    │                                        │
    ▼                                        │ (cache hit)
Balance Service                              │
    │                                        │
    ▼                                        │
Database (FOR UPDATE lock)                   │
    │                                        ▼
Celery Task Enqueue ─────────────────────▶ Return Cached Response
    │
    ▼
Celery Worker
    │
    ▼
Settlement Simulation
    │
    ├──▶ Success ──▶ Mark completed, debit ledger
    │
    ├──▶ Failure ──▶ Release funds, mark failed
    │
    └──▶ Timeout ──▶ Retry with backoff
```

---

## Part F: Verification Checklist

Before marking implementation complete, verify:

- [ ] 10000paise merchant, request 6000, balance becomes 4000 available + 6000 held
- [ ] Second concurrent 6000 request fails with insufficient balance
- [ ] Same idempotency key returns identical response, no new payout
- [ ] Payout status transitions: pending → processing → completed/failed only
- [ ] Failed payout restores available balance
- [ ] After 3 retries, hung payout marked failed, funds released
- [ ] All amounts stored as integer paise, no float
- [ ] Ledger entries sum matches balance
