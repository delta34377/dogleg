#!/usr/bin/env bash
# ============================================================================
# Dogleg SQL test harness — run the whole suite
# ============================================================================
# What it does, in a brand-new uniquely named database (so concurrent runs
# never collide):
#   1. applies database/tests/supabase_shim.sql   (Supabase roles, auth.*, grants)
#   2. applies database/tests/mock_schema.sql     (our best guess at prod's base schema)
#   3. applies every file in database/tests/apply_order.txt (the real migrations)
#   4. applies those files a SECOND time         (they must be safe to re-run)
#   5. runs every database/tests/test_*.sql in sorted order, each in its own
#      fresh copy of that migrated database (tests can't affect each other)
# and prints PASS/FAIL per file plus a summary. Exit code 0 = all passed.
#
# Usage:
#   database/tests/run.sh                 # everything
#   database/tests/run.sh smoke security  # only test files whose name contains "smoke" or "security"
#
# Environment variables (all optional):
#   DATABASE_URL         admin connection (default postgres://postgres@localhost:54329/postgres;
#                        must be a superuser, e.g. the postgres:16 Docker image's "postgres")
#   KEEP_DB=1            keep the databases afterwards (their names are printed)
#   VERBOSE=1            print every file's full output, including NOTICEs
#   IDEMPOTENCY_CHECK=0  skip step 4
#   MOCK_SCORES_TYPE     type of rounds.scores_by_hole/course_pars (default integer[]; try jsonb, json or 'text[]')
#   MOCK_PLAYED_AT_TYPE  type of rounds.played_at (default timestamptz; try date or timestamp)
#
# Only the psql client is needed, so this also runs in GitHub Actions against a
# postgres:16 service container (see README.md).
# ============================================================================
set -uo pipefail   # deliberately not -e: failures are counted and reported

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

KEEP_DB="${KEEP_DB:-0}"
VERBOSE="${VERBOSE:-0}"
IDEMPOTENCY_CHECK="${IDEMPOTENCY_CHECK:-1}"
MOCK_SCORES_TYPE="${MOCK_SCORES_TYPE:-integer[]}"
MOCK_PLAYED_AT_TYPE="${MOCK_PLAYED_AT_TYPE:-timestamptz}"

if [ -t 1 ]; then GREEN=$'\033[32m'; RED=$'\033[31m'; YELLOW=$'\033[33m'; BOLD=$'\033[1m'; RESET=$'\033[0m'
else GREEN=''; RED=''; YELLOW=''; BOLD=''; RESET=''; fi

die() { echo "${RED}ERROR:${RESET} $*" >&2; exit 2; }

command -v psql >/dev/null 2>&1 || die "psql not found. Install the PostgreSQL client (e.g. apt-get install postgresql-client, or brew install libpq)."

# Every session: UTC like Supabase; hide NOTICE chatter unless VERBOSE=1.
if [ "$VERBOSE" = "1" ]; then MIN_MESSAGES=notice; else MIN_MESSAGES=warning; fi
export PGOPTIONS="${PGOPTIONS:-} -c TimeZone=UTC -c client_min_messages=$MIN_MESSAGES"
export PGAPPNAME="dogleg-sql-harness"
export PGCONNECT_TIMEOUT="${PGCONNECT_TIMEOUT:-10}"

# --- connection ---------------------------------------------------------------
if [ -z "${DATABASE_URL:-}" ]; then
  DATABASE_URL="postgres://postgres@localhost:54329/postgres"
  # Nothing configured and nothing running: start the local test server.
  if ! psql -X -q "$DATABASE_URL" -c 'SELECT 1' >/dev/null 2>&1; then
    echo "No test server on localhost:54329 yet; starting one with start_local_pg.sh ..."
    "$SCRIPT_DIR/start_local_pg.sh" >/dev/null || die "could not start the local test server"
  fi
fi

if ! psql -X -q "$DATABASE_URL" -c 'SELECT 1' >/dev/null 2>&1; then
  die "cannot connect to DATABASE_URL ($DATABASE_URL).
       Start the local server with: database/tests/start_local_pg.sh"
fi
# url_for_db below needs the URL form (not "host=... port=..." keywords)
[[ "$DATABASE_URL" =~ ^postgres(ql)?:// ]] || die "DATABASE_URL must look like postgres://user@host:port/dbname"

# Build a URL for another database on the same server (swap the /dbname part,
# keep any ?query parameters such as sslmode).
url_for_db() {
  if [[ "$DATABASE_URL" =~ ^(postgres(ql)?://[^/?]*)(/[^?]*)?(\?.*)?$ ]]; then
    echo "${BASH_REMATCH[1]}/$1${BASH_REMATCH[4]}"
  else
    die "DATABASE_URL must look like postgres://user@host:port/dbname"
  fi
}

admin_sql() { psql -X -q -v ON_ERROR_STOP=1 "$DATABASE_URL" -c "$1"; }

# --- names, temp files, cleanup -----------------------------------------------
RUN_ID="$(date +%Y%m%d%H%M%S)_$$_$(od -An -N4 -tx4 /dev/urandom | tr -d ' \n')"
BASE_DB="dogleg_test_${RUN_ID}"
BASE_URL="$(url_for_db "$BASE_DB")"
LOG_DIR="$(mktemp -d "${TMPDIR:-/tmp}/dogleg-sql-harness.XXXXXX")"
CREATED_DBS=()

cleanup() {
  if [ "$KEEP_DB" = "1" ]; then
    if [ "${#CREATED_DBS[@]}" -gt 0 ]; then
      echo
      echo "KEEP_DB=1: kept these databases (drop them with DROP DATABASE ... when done):"
      for db in "${CREATED_DBS[@]}"; do echo "  $(url_for_db "$db")"; done
    fi
  else
    for db in ${CREATED_DBS[@]+"${CREATED_DBS[@]}"}; do
      admin_sql "DROP DATABASE IF EXISTS \"$db\" WITH (FORCE)" >/dev/null 2>&1 || true
    done
  fi
  rm -rf "$LOG_DIR"
}
trap cleanup EXIT
trap 'exit 130' INT TERM

now_ms() {
  local t
  t="$(date +%s%N 2>/dev/null)"
  case "$t" in *N|'') echo $(( $(date +%s) * 1000 ));; *) echo $(( t / 1000000 ));; esac
}

PASSED=0
FAILED=0
SKIPPED=0
FAILED_NAMES=()

# Run one SQL file against one database and report PASS/FAIL.
#   $1 label   $2 database URL   $3 file
run_sql_file() {
  local label="$1" url="$2" file="$3"
  local log="$LOG_DIR/$(echo "$label" | tr -c 'A-Za-z0-9._-' '_').log"
  local start end secs warnings status

  # Query results are noise (each assertion prints an empty row); keep only
  # errors, warnings and file:line positions unless VERBOSE=1.
  local results_to=/dev/null
  [ "$VERBOSE" = "1" ] && results_to=/dev/stdout

  start="$(now_ms)"
  psql -X -q -v ON_ERROR_STOP=1 \
       -v mock_scores_type="$MOCK_SCORES_TYPE" \
       -v mock_played_at_type="$MOCK_PLAYED_AT_TYPE" \
       -o "$results_to" \
       -f "$file" "$url" >"$log" 2>&1
  status=$?
  end="$(now_ms)"
  secs="$(awk -v ms="$(( end - start ))" 'BEGIN { printf "%.1fs", ms / 1000 }')"
  warnings="$(grep -c 'WARNING:' "$log" 2>/dev/null)"

  if [ "$status" -eq 0 ]; then
    PASSED=$((PASSED + 1))
    if [ "${warnings:-0}" -gt 0 ]; then
      printf '%sPASS%s  %s  (%s, %s%s warning(s)%s - VERBOSE=1 to see output)\n' \
        "$GREEN" "$RESET" "$label" "$secs" "$YELLOW" "$warnings" "$RESET"
    else
      printf '%sPASS%s  %s  (%s)\n' "$GREEN" "$RESET" "$label" "$secs"
    fi
    if [ "$VERBOSE" = "1" ] && [ -s "$log" ]; then sed 's/^/      /' "$log"; fi
    return 0
  fi

  FAILED=$((FAILED + 1))
  FAILED_NAMES+=("$label")
  printf '%sFAIL%s  %s  (%s)\n' "$RED" "$RESET" "$label" "$secs"
  if [ "$VERBOSE" = "1" ]; then
    sed 's/^/      /' "$log"
  else
    # The error is at the end; show enough context to locate it.
    tail -n 40 "$log" | sed 's/^/      /'
  fi
  return 1
}

# Repo-relative paths from apply_order.txt (comments and blank lines dropped).
APPLY_FILES=()
while IFS= read -r line || [ -n "$line" ]; do
  line="${line%%#*}"                                   # strip comments
  line="$(echo "$line" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
  [ -n "$line" ] && APPLY_FILES+=("$line")
done < "$SCRIPT_DIR/apply_order.txt"

# Test files, sorted the same way everywhere; optional name filters from $@.
TEST_FILES=()
while IFS= read -r f; do
  [ -n "$f" ] || continue
  name="$(basename "$f")"
  if [ "$#" -gt 0 ]; then
    keep=0
    for pattern in "$@"; do case "$name" in *"$pattern"*) keep=1;; esac; done
    [ "$keep" = "1" ] || continue
  fi
  TEST_FILES+=("$f")
done < <(find "$SCRIPT_DIR" -maxdepth 1 -name 'test_*.sql' | LC_ALL=C sort)

SERVER_VERSION="$(psql -X -At "$DATABASE_URL" -c 'SHOW server_version' 2>/dev/null)"
echo "${BOLD}Dogleg SQL harness${RESET}  (PostgreSQL ${SERVER_VERSION}; scores_by_hole ${MOCK_SCORES_TYPE}, played_at ${MOCK_PLAYED_AT_TYPE})"
echo "database: $BASE_DB"
echo

# --- 1-4. build the migrated base database ------------------------------------
admin_sql "CREATE DATABASE \"$BASE_DB\"" >/dev/null || die "could not create database $BASE_DB (is DATABASE_URL a superuser?)"
CREATED_DBS+=("$BASE_DB")

SETUP_OK=1
apply_or_stop() {   # $1 label  $2 absolute path
  [ "$SETUP_OK" = "1" ] || { SKIPPED=$((SKIPPED + 1)); printf '%sSKIP%s  %s\n' "$YELLOW" "$RESET" "$1"; return; }
  if [ ! -f "$2" ]; then
    FAILED=$((FAILED + 1)); FAILED_NAMES+=("$1")
    printf '%sFAIL%s  %s  (file not found: %s)\n' "$RED" "$RESET" "$1" "$2"
    SETUP_OK=0; return
  fi
  run_sql_file "$1" "$BASE_URL" "$2" || SETUP_OK=0
}

apply_or_stop "database/tests/supabase_shim.sql" "$SCRIPT_DIR/supabase_shim.sql"
apply_or_stop "database/tests/mock_schema.sql"   "$SCRIPT_DIR/mock_schema.sql"
for rel in ${APPLY_FILES[@]+"${APPLY_FILES[@]}"}; do
  apply_or_stop "$rel" "$REPO_ROOT/$rel"
done
if [ "$IDEMPOTENCY_CHECK" = "1" ]; then
  for rel in ${APPLY_FILES[@]+"${APPLY_FILES[@]}"}; do
    apply_or_stop "$rel (re-run: must be idempotent)" "$REPO_ROOT/$rel"
  done
fi

# --- 5. tests, each in its own copy of the base database -----------------------
if [ "$SETUP_OK" = "1" ]; then
  [ "${#TEST_FILES[@]}" -gt 0 ] || echo "${YELLOW}no test_*.sql files matched${RESET}"
  n=0
  for f in ${TEST_FILES[@]+"${TEST_FILES[@]}"}; do
    n=$((n + 1))
    test_db="${BASE_DB}_t$(printf '%02d' "$n")"
    if ! admin_sql "CREATE DATABASE \"$test_db\" TEMPLATE \"$BASE_DB\"" >/dev/null 2>"$LOG_DIR/createdb.err"; then
      FAILED=$((FAILED + 1)); FAILED_NAMES+=("database/tests/$(basename "$f")")
      printf '%sFAIL%s  database/tests/%s  (could not copy the base database)\n' "$RED" "$RESET" "$(basename "$f")"
      sed 's/^/      /' "$LOG_DIR/createdb.err"
      continue
    fi
    CREATED_DBS+=("$test_db")
    run_sql_file "database/tests/$(basename "$f")" "$(url_for_db "$test_db")" "$f"
    if [ "$KEEP_DB" != "1" ]; then
      admin_sql "DROP DATABASE IF EXISTS \"$test_db\" WITH (FORCE)" >/dev/null 2>&1 || true
    fi
  done
else
  for f in ${TEST_FILES[@]+"${TEST_FILES[@]}"}; do
    SKIPPED=$((SKIPPED + 1))
    printf '%sSKIP%s  database/tests/%s  (setup failed)\n' "$YELLOW" "$RESET" "$(basename "$f")"
  done
fi

# --- summary ------------------------------------------------------------------
echo
if [ "$FAILED" -eq 0 ]; then
  echo "${GREEN}${BOLD}ALL PASSED${RESET}: $PASSED passed, $SKIPPED skipped"
  exit 0
fi
echo "${RED}${BOLD}FAILED${RESET}: $FAILED failed, $PASSED passed, $SKIPPED skipped"
for name in "${FAILED_NAMES[@]}"; do echo "  - $name"; done
exit 1
