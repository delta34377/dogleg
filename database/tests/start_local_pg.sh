#!/usr/bin/env bash
# ============================================================================
# Dogleg SQL test harness — start a throwaway local PostgreSQL 16 server
# ============================================================================
# Safe to run as often as you like:
#   * a server already answering on the port  -> just prints DATABASE_URL
#   * a data directory that already exists    -> starts it
#   * nothing yet                             -> initdb, then start
#
# This server is for TESTS ONLY: trust auth (no password), localhost only,
# fsync off. Never point it at real data.
#
# Settings (all optional, via environment variables):
#   PGHARNESS_DIR   data directory   (default: $TMPDIR/dogleg-pg-harness). May be
#                   a symlink. When run as root the server runs as the "postgres"
#                   OS user, which must be able to reach the real directory.
#   PGHARNESS_PORT  TCP port         (default: 54329)
#   PG_BIN          folder holding initdb/pg_ctl (default: auto-detect,
#                   preferring /usr/lib/postgresql/16/bin)
#
# Usage:
#   database/tests/start_local_pg.sh
#   export DATABASE_URL=postgres://postgres@localhost:54329/postgres
#   database/tests/run.sh
#
# Stop it later with:
#   pg_ctl -D "$PGHARNESS_DIR" stop      (as the postgres user when root)
# ============================================================================
set -euo pipefail

PORT="${PGHARNESS_PORT:-54329}"
DATA_DIR="${PGHARNESS_DIR:-${TMPDIR:-/tmp}/dogleg-pg-harness}"
DATABASE_URL_OUT="postgres://postgres@localhost:${PORT}/postgres"

say() { echo "[start_local_pg] $*" >&2; }
die() { say "ERROR: $*"; exit 1; }

# --- 1. Find the PostgreSQL server binaries ---------------------------------
find_pg_bin() {
  if [ -n "${PG_BIN:-}" ]; then echo "$PG_BIN"; return; fi
  if [ -x /usr/lib/postgresql/16/bin/initdb ]; then echo /usr/lib/postgresql/16/bin; return; fi
  if command -v pg_config >/dev/null 2>&1 && [ -x "$(pg_config --bindir)/initdb" ]; then
    pg_config --bindir; return
  fi
  if command -v initdb >/dev/null 2>&1; then dirname "$(command -v initdb)"; return; fi
  die "could not find initdb. Install PostgreSQL 16 or set PG_BIN=/path/to/bin"
}
PG_BIN="$(find_pg_bin)"
[ -x "$PG_BIN/pg_ctl" ] || die "no pg_ctl in $PG_BIN"

# --- 2. Already running? Then there is nothing to do ------------------------
# (-U/-d only avoid a harmless 'role "root" does not exist' line in the server log)
if "$PG_BIN/pg_isready" -q -h localhost -p "$PORT" -U postgres -d postgres >/dev/null 2>&1; then
  say "a server is already accepting connections on localhost:$PORT"
  echo "DATABASE_URL=$DATABASE_URL_OUT"
  exit 0
fi

# --- 3. Decide which OS user runs the server --------------------------------
# PostgreSQL refuses to run as root. In a root container we run it as the
# "postgres" OS user; anywhere else (e.g. a Mac) as the current user.
if [ "$(id -u)" = "0" ]; then
  id postgres >/dev/null 2>&1 || die "running as root but there is no 'postgres' OS user"
  if command -v runuser >/dev/null 2>&1; then
    as_pg() { runuser -u postgres -- "$@"; }
  else
    as_pg() { su postgres -s /bin/bash -c "$(printf '%q ' "$@")"; }
  fi
  RUN_AS_ROOT=1
else
  as_pg() { "$@"; }
  RUN_AS_ROOT=0
fi

# --- 4. Create the data directory (first run only) --------------------------
mkdir -p "$DATA_DIR"
# Work with the physical path: PGHARNESS_DIR may be a symlink (see below), and
# the server must never have to walk through the symlink's parent folders.
DATA_DIR="$(cd -P "$DATA_DIR" && pwd)"

if [ "$RUN_AS_ROOT" = "1" ] && ! as_pg test -x "$(dirname "$DATA_DIR")"; then
  # e.g. a private 0700 temp folder: the postgres user cannot reach it, and
  # granting access to parent folders is fragile (tools reset it), which
  # crashes a running server. Keep the data somewhere world-traversable and
  # point a symlink at it instead.
  die "the postgres OS user cannot reach $DATA_DIR (a parent folder is private).
  Put the data under /tmp and symlink to it, e.g.:
    mkdir -p /tmp/dogleg-pg-harness && ln -sfn /tmp/dogleg-pg-harness '${PGHARNESS_DIR:-$DATA_DIR}'"
fi

if [ ! -f "$DATA_DIR/PG_VERSION" ]; then
  say "initialising a new cluster in $DATA_DIR"
  if [ "$RUN_AS_ROOT" = "1" ]; then
    chown postgres "$DATA_DIR"
    chmod 700 "$DATA_DIR"
  fi

  # -U postgres: the superuser is called "postgres", like Supabase's SQL editor
  # role and the official postgres:16 Docker image.
  as_pg "$PG_BIN/initdb" -D "$DATA_DIR" -U postgres --auth=trust -E UTF8 --locale=C >/dev/null

  # Test-only server settings (later lines in postgresql.conf win).
  as_pg sh -c "cat >> '$DATA_DIR/postgresql.conf'" <<EOF

# ---- added by database/tests/start_local_pg.sh (TEST SERVER ONLY) ----
listen_addresses = 'localhost'
unix_socket_directories = ''      # TCP only; avoids socket-path permission issues
timezone = 'UTC'                  # Supabase runs in UTC
log_timezone = 'UTC'
fsync = off                       # speed over durability: this data is disposable
synchronous_commit = off
full_page_writes = off
max_connections = 200             # several agents / CI jobs may run at once
EOF
fi

# --- 5. Start it --------------------------------------------------------------
say "starting PostgreSQL on localhost:$PORT (data: $DATA_DIR)"
as_pg "$PG_BIN/pg_ctl" -D "$DATA_DIR" -l "$DATA_DIR/server.log" -o "-p $PORT" -w -t 60 start >/dev/null \
  || { say "server failed to start; last lines of $DATA_DIR/server.log:"; tail -n 30 "$DATA_DIR/server.log" >&2 || true; exit 1; }

"$PG_BIN/pg_isready" -q -h localhost -p "$PORT" -U postgres -d postgres || die "server started but is not accepting connections on port $PORT"
say "ready"
echo "DATABASE_URL=$DATABASE_URL_OUT"
