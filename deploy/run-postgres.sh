#!/usr/bin/env bash
set -euo pipefail

PG_BIN=$(ls -d /usr/lib/postgresql/*/bin | tail -1)
PGDATA=/var/lib/postgresql/data

shutdown_postgres() {
    echo "[postgres] stopping postgres gracefully"
    su - postgres -c "$PG_BIN/pg_ctl -D $PGDATA -m fast -w stop" || true
    exit 0
}

trap shutdown_postgres SIGTERM SIGINT

echo "[postgres] starting postgres as postgres user"
su - postgres -c "$PG_BIN/postgres -D $PGDATA -c listen_addresses=127.0.0.1 -c port=5432 -c unix_socket_directories=/var/run/postgresql -c shared_buffers=64MB -c max_connections=25" &
PG_PID=$!

wait "$PG_PID"