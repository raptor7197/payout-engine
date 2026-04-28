import os

import celery

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "payouts.settings")

app = celery.Celery("payouts")  # type: ignore[attr-defined]
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()
