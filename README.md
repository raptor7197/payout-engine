# Playto Pay

Minimal payout engine with Django + DRF backend and a React + Tailwind dashboard.

## Requirements
- Python 3.10+
- PostgreSQL 14+
- Redis (for Celery)
- Node 18+

## Quick start
1. Create a virtualenv and install dependencies from `backend/requirements.txt`.
2. Copy `backend/.env.example` to `backend/.env` and update values.
3. Run `python backend/manage.py migrate`.
4. Seed demo data with `python backend/manage.py seed_data`.
5. Start the API server: `python backend/manage.py runserver`.
6. Start Celery worker: `celery -A payouts worker -l info`.
7. Start Celery beat: `celery -A payouts beat -l info`.
8. Copy `frontend/.env.example` to `frontend/.env` and set `VITE_MERCHANT_ID`.
9. Install dependencies with `npm install` inside `frontend`.
10. Run `npm run dev` inside `frontend`.

## Make targets
- `make backend-install`
- `make backend-migrate`
- `make backend-seed`
- `make backend-run`
- `make celery-worker`
- `make celery-beat`
- `make frontend-install`
- `make frontend-run`

## API summary
- `GET /api/v1/merchant/summary`
- `GET /api/v1/bank-accounts`
- `POST /api/v1/bank-accounts`
- `POST /api/v1/credits`
- `GET /api/v1/ledger`
- `GET /api/v1/payouts`
- `POST /api/v1/payouts` (requires `Idempotency-Key` header)

## API examples

```/dev/null/curl.txt#L1-25
# Create a bank account
curl -X POST http://localhost:8000/api/v1/bank-accounts \
  -H "Content-Type: application/json" \
  -H "X-Merchant-Id: 1" \
  -d '{"account_masked": "****1111", "ifsc": "TEST0001"}'

# Credit merchant balance
curl -X POST http://localhost:8000/api/v1/credits \
  -H "Content-Type: application/json" \
  -H "X-Merchant-Id: 1" \
  -d '{"amount_paise": 100000}'

# Create payout (idempotent)
curl -X POST http://localhost:8000/api/v1/payouts \
  -H "Content-Type: application/json" \
  -H "X-Merchant-Id: 1" \
  -H "Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000" \
  -d '{"amount_paise": 6000, "bank_account_id": 1}'
```

## Notes
- Use the `X-Merchant-Id` header (or `Authorization: Bearer <merchant_id>`) to authenticate.
- Idempotency keys are scoped per merchant and expire after 24 hours.
