#!/usr/bin/env bash
set -euo pipefail

ROLE="${SERVICE_ROLE:-api}"

if [[ "$ROLE" == "api" ]]; then
  cd backend
  python manage.py migrate
  exec python manage.py runserver "0.0.0.0:${PORT:-8000}"
fi

if [[ "$ROLE" == "worker" ]]; then
  cd backend
  exec celery --app payouts worker --loglevel info
fi

if [[ "$ROLE" == "beat" ]]; then
  cd backend
  exec celery --app payouts beat --loglevel info
fi

if [[ "$ROLE" == "frontend" ]]; then
  cd frontend
  exec npm run preview -- --host 0.0.0.0 --port "${PORT:-4173}"
fi

echo "unsupported SERVICE_ROLE: $ROLE"
exit 1
