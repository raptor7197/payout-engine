import os
from pathlib import Path

import dj_database_url

BASE_DIR = Path(__file__).resolve().parent.parent
ENV_PATH = BASE_DIR / ".env"
if ENV_PATH.exists():
    for line in ENV_PATH.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key, value)

SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "dev-secret")
DEBUG = os.environ.get("DJANGO_DEBUG", "true").lower() == "true"
ALLOWED_HOSTS = [
    host for host in os.environ.get("DJANGO_ALLOWED_HOSTS", "*").split(",") if host
]

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "corsheaders",
    "core.apps.CoreConfig",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "payouts.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    }
]

WSGI_APPLICATION = "payouts.wsgi.application"
ASGI_APPLICATION = "payouts.asgi.application"

db_user = os.environ.get("PGUSER") or os.environ.get("POSTGRES_USER", "postgres")
db_password = os.environ.get("PGPASSWORD") or os.environ.get(
    "POSTGRES_PASSWORD", "postgres"
)
db_host = os.environ.get("PGHOST") or os.environ.get("POSTGRES_HOST", "localhost")
db_port = os.environ.get("PGPORT") or os.environ.get("POSTGRES_PORT", "5432")
db_name = os.environ.get("PGDATABASE") or os.environ.get("POSTGRES_DB", "playtopay")
db_default_url = os.environ.get("DATABASE_URL") or (
    f"postgres://{db_user}:{db_password}@{db_host}:{db_port}/{db_name}"
)

DATABASES = {
    "default": dj_database_url.config(
        default=db_default_url,
        conn_max_age=600,
        conn_health_checks=True,
    )
}

AUTH_PASSWORD_VALIDATORS = []

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "/static/"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

TEST_RUNNER = "core.test_runner.CoreTestRunner"

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "core.auth.MerchantHeaderAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "core.auth.MerchantPermission",
    ],
}

CORS_ALLOW_ALL_ORIGINS = (
    os.environ.get("CORS_ALLOW_ALL_ORIGINS", "true").lower() == "true"
)

CELERY_BROKER_URL = os.environ.get("CELERY_BROKER_URL", "redis://localhost:6379/0")
CELERY_RESULT_BACKEND = os.environ.get(
    "CELERY_RESULT_BACKEND", "redis://localhost:6379/0"
)
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_TASK_SERIALIZER = "json"
CELERY_RESULT_SERIALIZER = "json"
CELERY_TIMEZONE = "UTC"

CELERY_BEAT_SCHEDULE = {
    "process-pending-payouts": {
        "task": "core.tasks.process_pending_payouts",
        "schedule": 10.0,
    },
    "retry-stuck-payouts": {
        "task": "core.tasks.retry_stuck_payouts",
        "schedule": 15.0,
    },
    "purge-idempotency-keys": {
        "task": "core.tasks.purge_expired_idempotency_keys",
        "schedule": 3600.0,
    },
}
