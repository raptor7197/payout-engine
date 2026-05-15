# Playto Pay — Payout Engine PRD (Architecture-First)
Context: Build a minimal but production-minded payout engine for Indian agencies/freelancers receiving international payments and withdrawing INR to Indian bank accounts.

---

## 1) Problem Statement

Playto Pay solves cross-border collections for merchants who cannot use Stripe/PayPal directly.  
In this assignment scope, collection is simulated (credits exist), and the core challenge is payout correctness:

- Merchants have balances in paise.
- They request payouts.
- System holds funds, processes payout asynchronously, settles to completed/failed.
- If failed, held funds must be returned atomically.
- Concurrency, idempotency, ledger correctness, and state machine integrity are mandatory.

This is a money-moving system where correctness > features and architecture > UI polish.

---

## 2) Goals and Non-Goals

### Goals
1. Accurate ledger and balances using integer paise.
2. Safe concurrent payout requests (no overdraft race).
3. Merchant-scoped idempotent payout creation with 24h key TTL.
4. Strict payout state machine with legal transitions only.
5. Async background processing + retry/backoff + timeout handling.
6. Merchant dashboard showing available/held balances and payout history.
7. Explainability via EXPLAINER.md with concrete code/query snippets.

### Non-Goals
1. Real payment gateway integration.
2. Full KYC/compliance workflow.
3. Multi-currency ledger (only paise INR in this scope).
4. Advanced auth/permissions platform (simple merchant auth acceptable).
5. Full observability stack (basic logs/metrics acceptable).

---

## 3) Success Criteria (What is graded)

1. Money Integrity
   - All amounts stored as integer paise (BigIntegerField).
   - No float arithmetic.
   - Balance calculations done with DB-level operations.
   - Invariant holds: credits - debits == displayed balance.

2. Concurrency
   - Two simultaneous payout requests that jointly exceed balance must not both pass.
   - Exactly one succeeds in the 100₹ + (60₹,60₹) scenario.

3. Idempotency
   - Same merchant + same idempotency key returns exact same response.
   - No duplicate payout created.
   - TTL expiration: 24h.

4. State Machine
   - Only:
     - pending -> processing -> completed
     - pending -> processing -> failed
   - Illegal transitions blocked.

5. Retry Logic
   - Processing >30s => retry with exponential backoff.
   - Max 3 attempts.
   - Then mark failed and release held funds atomically.

6. Delivery Completeness
   - Django+DRF backend, React+Tailwind frontend.
   - PostgreSQL.
   - Real async worker (Celery/Django-Q/Huey).
   - Seed data.
   - Tests (at least concurrency + idempotency).
   - Deployment URL.
   - Clean docs + explainer.

---

## 4) Functional Requirements

## 4.1 Merchant Ledger
- Merchant has:
  - available_balance_paise
  - held_balance_paise
- Credits (simulated incoming customer payments) increase available balance.
- Payout request creates a hold:
  - available decreases
  - held increases
- Completed payout settles hold to final debit.
- Failed payout reverses hold:
  - held decreases
  - available increases

## 4.2 Payout Request API
- POST /api/v1/payouts
- Headers:
  - Idempotency-Key: <merchant-scoped UUID>
- Body:
  - amount_paise (integer > 0)
  - bank_account_id
- Behavior:
  - create pending payout + hold funds if sufficient balance.
  - if same key repeated within 24h, return exact same response body/status.
  - if insufficient funds, reject cleanly.

## 4.3 Payout Processor
- Async worker picks pending payouts.
- Simulated settlement outcomes:
  - 70% completed
  - 20% failed (release held funds)
  - 10% remains processing/hung
- Hung payouts retried with backoff and max attempts.

## 4.4 Merchant Dashboard
- Show:
  - available balance
  - held balance
  - recent ledger events (credits/debits/holds/releases)
  - payout history + live status refresh
- Actions:
  - create payout request

---

## 5) Non-Functional Requirements

1. Consistency: ACID transactions around balance mutations.
2. Concurrency Safety: Row locks and atomic DB updates.
3. Durability: Ledger is append-only for financial traceability.
4. Auditability: Every payout transition recorded.
5. Performance: Typical payout request <300ms excluding queueing.
6. Recoverability: Worker retries and safe failure handling.
7. Idempotent API reliability: Safe against client retries/timeouts.

---

## 6) Domain Model (Proposed)

## 6.1 Entities

### Merchant
- id
- name
- email
- timestamps

### MerchantBalance (1:1 with Merchant)
- merchant_id (unique FK)
- available_balance_paise BIGINT NOT NULL DEFAULT 0
- held_balance_paise BIGINT NOT NULL DEFAULT 0
- version BIGINT (optional optimistic counter)
- timestamps

### LedgerEntry (append-only)
- id
- merchant_id
- entry_type enum:
  - credit
  - payout_hold
  - payout_release
  - payout_debit_final
- amount_paise BIGINT (always positive; meaning from type)
- payout_id nullable FK
- reference text/json
- created_at

### BankAccount
- id
- merchant_id
- account_masked
- ifsc
- is_active
- timestamps

### Payout
- id
- merchant_id
- bank_account_id
- amount_paise BIGINT
- status enum (pending,processing,completed,failed)
- attempt_count INT default 0
- next_retry_at nullable
- failure_reason nullable
- idempotency_key (optional denormalized copy)
- timestamps (created_at, updated_at, processing_started_at, completed_at, failed_at)

### IdempotencyKey
- id
- merchant_id
- key (UUID/text)
- request_hash (hash of normalized method+path+body)
- response_status_code
- response_body JSONB
- resource_type (payout)
- resource_id nullable
- state enum (in_progress,completed,failed)
- expires_at (created + 24h)
- timestamps
- Unique constraint: (merchant_id,key)

### PayoutStateTransition (optional but recommended)
- id
- payout_id
- from_status
- to_status
- actor (system_worker,api,admin)
- metadata JSONB
- created_at

---

## 7) Core Invariants

1. available_balance_paise >= 0
2. held_balance_paise >= 0
3. Balance snapshot equals ledger aggregate projection.
4. Payout amounts always > 0.
5. No payout leaves completed or failed to any other state.
6. Failed payout fund release and state change are atomic.
7. Idempotency key uniqueness scoped by merchant for 24h validity.

---

## 8) API Contract (Detailed)

## 8.1 POST /api/v1/payouts

### Request
Headers:
- Authorization: Bearer ...
- Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000

Body:
`json
{
  "amount_paise": 6000,
  "bank_account_id": "ba_123"
}
