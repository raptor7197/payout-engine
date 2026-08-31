#!/usr/bin/env bash
set -euo pipefail

cd /app/backend

for i in $(seq 1 30); do
    if python manage.py migrate --noinput; then
        break
    fi
    echo "[web] database not ready, retrying in 2s..."
    sleep 2
done

python manage.py collectstatic --noinput || true

if [ "$(python manage.py shell -c 'from core.models import Merchant; print(Merchant.objects.count())')" = "0" ]; then
    echo "[web] seeding initial data"
    python manage.py seed_data
fi

echo "[web] starting gunicorn"
exec gunicorn payouts.wsgi:application \
    --bind 0.0.0.0:8000 \
    --workers 2 \
    --threads 4 \
    --timeout 120 \
    --access-logfile -