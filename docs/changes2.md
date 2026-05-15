# changes2.md

this file records what was changed in this iteration and why those changes were made.

## 1) docker + local runtime alignment

### what changed
- verified postgres container status and port mapping for `playtopay-postgres`.
- confirmed backend env uses `POSTGRES_HOST=127.0.0.1` and the mapped host port.
- started redis container `playtopay-redis` for celery broker/result backend.
- started and validated backend processes: django api, celery worker, and celery beat.

### why it was done
- tests and app startup were failing due to db connectivity/auth assumptions.
- forcing tcp host + containerized postgres avoided host-side `ident` auth behavior.
- celery requires redis; without it, async payout processing and retries do not work.

## 2) short architecture-first readme

### what changed
- rewrote top-level `README.md` to a short architecture-first format.
- added a mermaid architecture diagram.
- focused content on design decisions and rationale, not just setup commands.
- kept writing style concise and human, with lowercase body text as requested.

### why it was done
- the previous readme was command-heavy but not clear on system design intent.
- the new version makes it easier to understand tradeoffs quickly.

## 3) detailed backend document

### what changed
- added `backend/README.md` as a detailed backend deep dive.
- documented payout lifecycle, idempotency flow, state transitions, retry behavior, and data model choices.
- linked the top-level readme to the backend deep-dive document.

### why it was done
- you asked for a detailed explanation of what was built and how.
- this separates quick project onboarding from deep implementation details.

## 4) seed data expansion (more merchants)

### what changed
- updated `backend/core/management/commands/seed_data.py` to seed 6 merchants total.
- refactored merchant seeding into a single list + loop for maintainability.
- each seeded merchant gets a bank account and opening credit.

### why it was done
- you wanted 2-3 additional merchants.
- loop-based seed logic avoids repetitive blocks and is easier to extend later.

## 5) merchant-aware dashboard (not pinned to one account)

### what changed
- added backend endpoint `GET /api/v1/merchants` in:
- `backend/core/views.py`
- `backend/core/urls.py`
- `backend/core/serializers.py`
- updated frontend api client (`frontend/src/api/client.js`) to accept per-request `merchantId`.
- updated dashboard (`frontend/src/pages/Dashboard.jsx`) to:
- load merchant list
- render merchant selector dropdown
- fetch summary/accounts/payouts/ledger per selected merchant
- updated payout form (`frontend/src/components/PayoutForm.jsx`) to submit using selected merchant id.
- updated app header text (`frontend/src/App.jsx`) so it no longer claims merchant id comes only from env.

### why it was done
- ui was effectively locked to one merchant via `VITE_MERCHANT_ID`.
- this prevented visibility into additional seeded merchants.
- selector-based context switching makes multi-merchant testing realistic.

## 6) backend activity log surfaced in ui

### what changed
- added backend endpoint `GET /api/v1/activity-log` in:
- `backend/core/views.py`
- `backend/core/urls.py`
- activity log aggregates and orders events from:
- `PayoutStateTransition`
- `LedgerEntry`
- `IdempotencyKey`
- added frontend panel `frontend/src/components/ActivityLog.jsx`.
- wired dashboard data loading to fetch and show activity log per selected merchant.
- updated dashboard grid layout to show payouts, ledger, and activity side by side.

### why it was done
- you asked for a side div that shows what happened in backend.
- using real persisted backend events keeps frontend logs consistent with actual state transitions and ledger writes.

## 7) railway deployment config consolidation

### what changed
- created unified root config `railway.json`.
- added role-driven scripts:
- `railway/build.sh`
- `railway/start.sh`
- scripts select behavior by `SERVICE_ROLE` (`api`, `worker`, `beat`, `frontend`).
- removed old per-service railway files:
- `backend/railway.api.json`
- `backend/railway.worker.json`
- `backend/railway.beat.json`
- `frontend/railway.json`

### why it was done
- you asked for one config file at repo root.
- one root config + role scripts keeps deployment behavior centralized while still supporting multiple service roles.

## 8) validation runs

### what changed
- ran backend health checks: `python backend/manage.py check`.
- ran frontend production builds: `npm run build`.

### why it was done
- to ensure backend endpoint additions and frontend wiring compile and load correctly after changes.
