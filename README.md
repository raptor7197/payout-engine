# Playto Pay Founding engineer Task 

a payout engine with a django backend, celery workers, postgres, redis, and a react dashboard.

## Architecture Diagram

```mermaid
flowchart lr
  ui[react dashboard]
  api[django + drf api]
  db[(postgres)]
  cache[(redis)]
  beat[celery beat]
  worker[celery worker]

  ui -->|http| api
  api -->|transactions + locks| db
  api -->|enqueue payout jobs| cache
  beat -->|schedule retry/scan jobs| cache
  cache --> worker
  worker -->|state updates + ledger writes| db
```

## Architecture Decisions

- i used postgres as the source of truth because payouts need strict consistency, row-level locking, and safe transactions.
- i kept idempotency keys in the backend data model so duplicate requests return stable results instead of creating duplicate payouts.
- i moved payout execution to celery workers so the api stays fast and users do not wait on bank settlement simulation.
- i added celery beat for periodic scans and retries so stuck payouts recover automatically without manual intervention.
- i kept redis only as a queue/result backend so async work is decoupled from api request threads.
- i used a small react dashboard for visibility into balances, payouts, and ledger entries during testing.

## Why This Shape

- this split keeps request-time logic simple: validate, reserve funds, record payout intent, enqueue job.
- money movement rules stay in one place with transactional updates, which reduces race-condition bugs.
- async processing gives better failure handling because retries and backoff are handled in worker flows.
- each piece has a clear job, so debugging is easier when something fails in api, queueing, or processing.

## Detailed Backend Notes

- full backend explanation is in [backend/README.md](backend/README.md).

## Quick Run

1. start postgres and redis containers.
2. run `python backend/manage.py migrate`.
3. run `python backend/manage.py seed_data`.
4. run `python backend/manage.py runserver`.
5. run `celery --app payouts worker --loglevel info`.
6. run `celery --app payouts beat --loglevel info`.
7. run `cd frontend && npm install && npm run dev`.
