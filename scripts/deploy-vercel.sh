#!/usr/bin/env bash
# One-command path from an empty Neon database to a live, persistent HTTPS URL.
#
# Runs entirely from the sandbox. Nothing is downloaded or hosted locally.
#
# Required:
#   VERCEL_TOKEN  - Vercel access token (vercel.com/account/tokens)
#   DATABASE_URL  - Neon POOLED connection string for the app at runtime
#
# Optional:
#   DATABASE_URL_UNPOOLED - Neon DIRECT string, used for the schema push
#   TUYA_ACCESS_ID / TUYA_ACCESS_SECRET / TUYA_ENDPOINT
#   VERCEL_PROJECT_NAME   - defaults to tuya-wall-dashboard
set -euo pipefail

fail() { echo "ERROR: $*" >&2; exit 1; }

[ -n "${VERCEL_TOKEN:-}" ] || fail "VERCEL_TOKEN is not set."
[ -n "${DATABASE_URL:-}" ] || fail "DATABASE_URL is not set."

case "$DATABASE_URL" in
  *127.0.0.1*|*localhost*)
    fail "DATABASE_URL points at the local sandbox database. Use the Neon string." ;;
esac

PROJECT_NAME="${VERCEL_PROJECT_NAME:-tuya-wall-dashboard}"
MIGRATE_URL="${DATABASE_URL_UNPOOLED:-$DATABASE_URL}"
VC="npx --yes vercel@latest"

echo "==> 1/5 Verifying database connectivity"
psql "$MIGRATE_URL" -X -A -t -c "select 1;" >/dev/null 2>&1 \
  || fail "Cannot connect using the supplied database URL."
echo "    connected to $(psql "$MIGRATE_URL" -X -A -t -c 'select current_database();' 2>/dev/null)"

echo "==> 2/5 Applying schema (idempotent)"
DATABASE_URL_UNPOOLED="$MIGRATE_URL" npx drizzle-kit push --force 2>&1 \
  | grep -E 'Changes applied|No changes detected|Error' || true

TABLES=$(psql "$MIGRATE_URL" -X -A -t -c \
  "select count(*) from information_schema.tables where table_schema='public';" 2>/dev/null)
echo "    tables in public schema: ${TABLES}"
[ "${TABLES:-0}" -ge 5 ] || fail "Schema push did not produce the expected tables."

echo "==> 3/5 Linking Vercel project: ${PROJECT_NAME}"
$VC link --yes --project "${PROJECT_NAME}" --token "${VERCEL_TOKEN}" >/dev/null \
  || fail "Vercel link failed. The token may be invalid, expired, or revoked."

echo "==> 4/5 Uploading server-side environment variables"
set_env() {
  local key="$1" value="$2"
  [ -z "$value" ] && return 0
  $VC env rm "$key" production --yes --token "$VERCEL_TOKEN" >/dev/null 2>&1 || true
  printf '%s' "$value" | $VC env add "$key" production --token "$VERCEL_TOKEN" >/dev/null 2>&1 \
    && echo "    set ${key} (production, server-side only)"
}
set_env DATABASE_URL          "$DATABASE_URL"
set_env DATABASE_URL_UNPOOLED "${DATABASE_URL_UNPOOLED:-}"
set_env TUYA_ACCESS_ID        "${TUYA_ACCESS_ID:-}"
set_env TUYA_ACCESS_SECRET    "${TUYA_ACCESS_SECRET:-}"
set_env TUYA_ENDPOINT         "${TUYA_ENDPOINT:-https://openapi.tuyaus.com}"

echo "==> 5/5 Building and deploying to production"
DEPLOY_URL=$($VC deploy --prod --yes --token "${VERCEL_TOKEN}" 2>/dev/null | tail -n 1)
[ -n "$DEPLOY_URL" ] || fail "Deploy did not return a URL."

echo
echo "=============================================================="
echo " PERSISTENT PUBLIC HTTPS URL"
echo "   ${DEPLOY_URL}"
echo "=============================================================="
echo
echo "Verifying the live site..."
curl -s -o /dev/null -w "  homepage : http=%{http_code}  tls_ok=%{ssl_verify_result}\n" "${DEPLOY_URL}/" --max-time 30
printf '  health   : '; curl -s "${DEPLOY_URL}/api/health" --max-time 30; echo
echo
echo "NOTE: this dashboard has no authentication and controls physical"
echo "devices. Put Cloudflare Access, Tailscale, or proxy auth in front"
echo "of it before relying on it."
