#!/usr/bin/env bash
# scripts/ci-deploy.sh — box-side deploy entry point.
#
# Called by GitHub Actions OVER SSH, AFTER apps/web/.env.local has been
# rendered on the runner and scp'd to the box. This script NEVER touches
# secrets — it assumes .env.local is already in place.
#
# Usage:
#   TARGET_SHA=<git-sha> DEPLOY_ACTOR=<github-user> \
#     bash scripts/ci-deploy.sh <development|production>
#
# What it does (in order):
#   1. Preflight checks (checkout exists, .env.local present, pm2/pnpm on PATH)
#   2. Fetch + checkout the target commit (pinned, not branch-tracking)
#   3. pnpm install --frozen-lockfile
#   4. prisma generate + prisma migrate deploy (non-interactive, prod-safe)
#   5. pnpm --filter @trt/web build
#   6. pm2 reload <name> --update-env (zero-downtime reload, preserves env)
#   7. Append to /var/log/trt-deploy.log (audit trail)
#
# Design notes:
#   - `prisma migrate deploy` (not `migrate dev`) — migrations are authored
#     manually/locally and committed; CI only applies them. No interactive
#     prompts, safe for unattended deploy.
#   - `pm2 reload --update-env` reloads the process and re-reads .env.local.
#     It does NOT restart if the process is stopped; for cold starts run
#     `pm2 start ecosystem.web.config.cjs --only <name>` first.
#   - Failures exit non-zero, which propagates back to the GitHub Actions job.

set -euo pipefail

ENV_ARG="${1:?usage: ci-deploy.sh <development|production>}"
case "$ENV_ARG" in
  development) APP_DIR="/opt/trt-dev"; PM2_NAME="trt-dev" ;;
  production)  APP_DIR="/opt/trt";     PM2_NAME="trt" ;;
  *) echo "ERROR: unknown environment: $ENV_ARG (expected development|production)" >&2; exit 2 ;;
esac

# --- 0. Preflight ----------------------------------------------------------
[[ -d "$APP_DIR/.git" ]] || { echo "ERROR: $APP_DIR is not a git checkout" >&2; exit 3; }
[[ -f "$APP_DIR/apps/web/.env.local" ]] || { echo "ERROR: $APP_DIR/apps/web/.env.local missing — render it on the runner and scp it first" >&2; exit 4; }
command -v pm2 >/dev/null 2>&1 || { echo "ERROR: pm2 not on PATH" >&2; exit 5; }
command -v pnpm >/dev/null 2>&1 || { echo "ERROR: pnpm not on PATH" >&2; exit 6; }

cd "$APP_DIR"

# The SHA to deploy. Defaults to current HEAD (rollback case); CI always sets it.
TARGET_SHA="${TARGET_SHA:-$(git rev-parse HEAD)}"
DEPLOY_ACTOR="${DEPLOY_ACTOR:-unknown}"
STARTED_AT="$(date -u +%FT%TZ)"

echo "=== Deploying $ENV_ARG at $TARGET_SHA to $APP_DIR (pm2: $PM2_NAME) ==="
echo "    started: $STARTED_AT  actor: $DEPLOY_ACTOR"

# --- 1. Fetch + pin to target commit ---------------------------------------
git fetch --quiet origin
git checkout --force "$TARGET_SHA"
git submodule update --init --recursive 2>/dev/null || true
echo "    checked out: $(git rev-parse --short HEAD) ($(git log -1 --format=%s))"

# --- 1b. Load env from .env.local into this shell --------------------------
# Prisma runs from packages/db/ and does NOT auto-load apps/web/.env.local.
# Next.js loads it itself at runtime, but prisma generate/migrate need
# DATABASE_URL in the environment NOW. `set -a` auto-exports all sourced vars.
set -a
. apps/web/.env.local
set +a
[[ -n "${DATABASE_URL:-}" ]] || { echo "ERROR: DATABASE_URL not in apps/web/.env.local after sourcing" >&2; exit 7; }
echo "    env loaded from apps/web/.env.local ($(grep -c '=' apps/web/.env.local) vars)"

# --- 2. Install deps (frozen — fails if lockfile drift) --------------------
pnpm install --frozen-lockfile

# --- 3. Prisma generate + apply migrations (non-interactive) ---------------
pnpm --filter @trt/db generate
# `migrate deploy` applies pending migrations and exits; never prompts.
pnpm --filter @trt/db exec prisma migrate deploy

# --- 4. Build --------------------------------------------------------------
pnpm --filter @trt/web build

# --- 5. Reload pm2 (zero-downtime) -----------------------------------------
# --update-env re-reads .env.local. If the process doesn't exist, this errors —
# for first-time setup run `pm2 start ecosystem.web.config.cjs --only $PM2_NAME`.
pm2 reload "$PM2_NAME" --update-env
pm2 save

# --- 6. Audit log ----------------------------------------------------------
AUDIT_LOG="/var/log/trt-deploy.log"
mkdir -p "$(dirname "$AUDIT_LOG")"
FINISHED_AT="$(date -u +%FT%TZ)"
echo "$FINISHED_AT env=$ENV_ARG sha=$TARGET_SHA pm2=$PM2_NAME actor=$DEPLOY_ACTOR result=ok" >> "$AUDIT_LOG"

echo "=== $ENV_ARG deploy complete: $TARGET_SHA ==="
