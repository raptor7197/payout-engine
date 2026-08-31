# --- Stage 1: build frontend ---
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
ARG VITE_API_BASE_URL=/api/v1
ARG VITE_MERCHANT_ID=1
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_MERCHANT_ID=$VITE_MERCHANT_ID
RUN npm run build

# --- Stage 2: backend + services ---
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends \
        postgresql \
        redis-server \
        nginx \
        supervisor \
        curl \
    && rm -rf /var/lib/apt/lists/* \
    && rm -f /etc/nginx/sites-enabled/default

WORKDIR /app

COPY backend/ /app/backend/
COPY --from=frontend-build /app/frontend/dist /app/frontend/dist

RUN python -m pip install --no-cache-dir --upgrade pip \
    && python -m pip install --no-cache-dir -r /app/backend/requirements.txt \
        gunicorn

COPY deploy/nginx.conf /etc/nginx/conf.d/app.conf
COPY deploy/supervisord.conf /etc/supervisor/conf.d/app.conf
COPY deploy/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
COPY deploy/run-postgres.sh /usr/local/bin/run-postgres.sh
COPY deploy/run-web.sh /usr/local/bin/run-web.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh \
    /usr/local/bin/run-postgres.sh \
    /usr/local/bin/run-web.sh

VOLUME /var/lib/postgresql/data
EXPOSE 80

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]