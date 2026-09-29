#!/usr/bin/env bash
# Verifies which required secrets have reached this sandbox.
# Prints ONLY presence/shape - never the secret values themselves.
set -uo pipefail

mask() {
  # Show enough to identify a value without disclosing it.
  local v="$1"
  if [ -z "$v" ]; then echo "(empty)"; return; fi
  if [[ "$v" == postgres* ]]; then
    # Reveal host + database only; strip user:password entirely.
    echo "$v" | sed -E 's#^(postgres(ql)?://)[^@]*@#\1***:***@#; s#\?.*$#?...#'
  else
    echo "${v:0:4}...${v: -4} (len ${#v})"
  fi
}

# Record which values came from the real environment (e.g. an Arena secret)
# before layering in .env, so the two sources can be told apart.
ENV_DATABASE_URL="${DATABASE_URL:-}"

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env 2>/dev/null || true
  set +a
  DOTENV_PRESENT=1
else
  DOTENV_PRESENT=0
fi

echo "=================================================="
echo " Secret availability check"
echo "=================================================="
if [ "$DOTENV_PRESENT" = "1" ]; then
  if [ -n "$ENV_DATABASE_URL" ]; then
    echo " DATABASE_URL source: real environment (survives .env resets)"
  else
    echo " DATABASE_URL source: .env file (NOT durable - reset with sandbox)"
  fi
fi
echo
printf '%-24s %s\n' "VARIABLE" "STATUS"
printf '%-24s %s\n' "------------------------" "----------------------------------"

for key in DATABASE_URL DATABASE_URL_UNPOOLED VERCEL_TOKEN NEON_API_KEY TUYA_ACCESS_ID TUYA_ACCESS_SECRET; do
  val="${!key:-}"
  if [ -n "$val" ]; then
    printf '%-24s PRESENT  %s\n' "$key" "$(mask "$val")"
  else
    printf '%-24s absent\n' "$key"
  fi
done

echo
echo "--- DATABASE_URL target analysis ---"
db="${DATABASE_URL:-}"
if [ -z "$db" ]; then
  echo "  DATABASE_URL is not set in the environment."
elif [[ "$db" == *"127.0.0.1"* || "$db" == *"localhost"* ]]; then
  echo "  WARNING: points at the LOCAL sandbox database."
  echo "  This data is destroyed when the sandbox resets."
elif [[ "$db" == *"neon.tech"* ]]; then
  echo "  OK: points at Neon (persistent)."
  [[ "$db" == *"-pooler."* ]] \
    && echo "  Endpoint: POOLED (correct for application runtime)." \
    || echo "  Endpoint: DIRECT (fine; pooled is preferred for runtime)."
else
  echo "  Points at a non-Neon remote host."
fi

echo
echo "--- live connectivity test ---"
if [ -n "$db" ]; then
  if psql "$db" -X -A -t -c "select 'connected to '||current_database();" 2>/dev/null | head -1; then
    psql "$db" -X -A -t -c \
      "select 'tables in public schema: '||count(*) from information_schema.tables where table_schema='public';" 2>/dev/null | head -1
  else
    echo "  Could not connect with the current DATABASE_URL."
  fi
else
  echo "  Skipped (no DATABASE_URL)."
fi
echo "=================================================="
