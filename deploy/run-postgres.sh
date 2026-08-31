#!/usr/bin/env bash
set -euo pipefail

PG_BIN=$(ls -d /usr/lib/postgresql/*/bin | tail -1)
exec "$PG_BIN/postgres" \
    -D /var/lib/postgresql/data \
    -c listen_addresses=127.0.0.1 \
    -c port=5432 \
    -c unix_socket_directories=/var/run/postgresql