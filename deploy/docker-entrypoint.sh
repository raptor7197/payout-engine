#!/usr/bin/env bash
set -euo pipefail

PGDATA=/var/lib/postgresql/data
PG_BIN=$(ls -d /usr/lib/postgresql/*/bin | tail -1)
POSTGRES_DB="${POSTGRES_DB:-playtopay}"

mkdir -p "$PGDATA" /var/run/postgresql
chown -R postgres:postgres "$PGDATA" /var/run/postgresql

if [ ! -s "$PGDATA/PG_VERSION" ]; then
    echo "[entrypoint] initializing postgres cluster in $PGDATA"
    su - postgres -c "$PG_BIN/initdb -D $PGDATA -U postgres --auth=trust --encoding=UTF8"
fi

echo "[entrypoint] starting temporary postgres for bootstrap"
su - postgres -c "$PG_BIN/pg_ctl -D $PGDATA -l /tmp/pg-bootstrap.log -o '-c listen_addresses=127.0.0.1 -c port=5432 -c unix_socket_directories=/var/run/postgresql' -w start"

EXISTS=$(su - postgres -c "$PG_BIN/psql -h /var/run/postgresql -U postgres -tAc \"SELECT 1 FROM pg_database WHERE datname='$POSTGRES_DB'\"" || echo "")
if [ "$EXISTS" != "1" ]; then
    echo "[entrypoint] creating database $POSTGRES_DB"
    su - postgres -c "$PG_BIN/createdb -h /var/run/postgresql -U postgres $POSTGRES_DB"
else
    echo "[entrypoint] database $POSTGRES_DB already exists"
fi

su - postgres -c "$PG_BIN/pg_ctl -D $PGDATA -m fast -w stop"

echo "[entrypoint] starting supervisord"
exec supervisord -c /etc/supervisor/conf.d/app.conf