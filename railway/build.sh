#!/usr/bin/env bash
set -euo pipefail

ROLE="${SERVICE_ROLE:-api}"

if [[ "$ROLE" == "frontend" ]]; then
  cd frontend
  npm ci
  npm run build
  exit 0
fi

python -m pip install --upgrade pip
python -m pip install -r backend/requirements.txt
