#!/usr/bin/env bash
set -euo pipefail

exec > /proc/1/fd/1 2>&1

cd /app/backend

for i in $(seq 1 30); do
    if python manage.py migrate --noinput; then
        break
    fi
    echo "[web] database not ready, retrying in 2s..."
    sleep 2
done

python manage.py collectstatic --noinput || true

if MERCHANT_COUNT="$(python manage.py shell -c 'from core.models import Merchant; print(Merchant.objects.count())' 2>&1)"; then
    if [ "$MERCHANT_COUNT" = "0" ]; then
        echo "[web] seeding initial data"
        python manage.py seed_data
    else
        echo "[web] seed check: $MERCHANT_COUNT merchants present"
    fi
else
    echo "[web] seed check failed (continuing): $MERCHANT_COUNT"
fi

echo "[web] starting gunicorn"
exec gunicorn payouts.wsgi:application \
    --bind 0.0.0.0:8000 \
    --workers 1 \
    --threads 8 \
    --timeout 120 \
    --access-logfile -