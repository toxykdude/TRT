#!/usr/bin/env bash
# scripts/setup-github.sh — one-time GitHub repo configuration for the CI/CD pipeline.
#
# Three subcommands (run in this order):
#
#   1. bash scripts/setup-github.sh infra
#      Creates the `development` + `production` GitHub Environments,
#      sets repo-level LXC_* secrets, and applies branch protection on main.
#      Requires these exported: LXC_HOST, LXC_SSH_USER, LXC_SSH_KEY, LXC_KNOWN_HOSTS
#
#   2. bash scripts/setup-github.sh env development
#      Sets DEVELOPMENT environment secrets from the values you exported.
#      Requires: DATABASE_URL (trt_dev DB), AUTH_SECRET, NEXTAUTH_SALT,
#      OPENAI_API_KEY (empty ok), OPENAI_API_URL, OPENAI_MODEL, RESEND_API_KEY,
#      EMAIL_FROM, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, MCP_AUTH_TOKEN,
#      WOMPI_ENV, WOMPI_PUBLIC_KEY, WOMPI_EVENTS_SECRET, WOMPI_INTEGRITY_SECRET,
#      STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_PLUS_MONTHLY,
#      STRIPE_PRICE_PLUS_YEARLY, STRIPE_PRICE_PRO_MONTHLY (empty ok in DEV
#      stub mode; every Stripe var is per-environment — test vs live mode
#      issue different Price ids and webhook signing secrets)
#
#   3. bash scripts/setup-github.sh env production
#      Sets PRODUCTION environment secrets from the values you exported.
#      Same var names, DIFFERENT values (real prod DB, real OPENAI_API_KEY,
#      live-mode Stripe keys/Price ids, etc.)
#
# USAGE
#   gh auth login --scopes repo,workflow
#   # Create ~/.trt-secrets-infra.env with LXC_* exports (OUTSIDE the repo)
#   source ~/.trt-secrets-infra.env && bash scripts/setup-github.sh infra
#   # Then create ~/.trt-secrets-dev.env and ~/.trt-secrets-prod.env
#   source ~/.trt-secrets-dev.env  && bash scripts/setup-github.sh env development
#   source ~/.trt-secrets-prod.env && bash scripts/setup-github.sh env production
#
# IDEMPOTENT: safe to re-run; updates in place.

set -euo pipefail

command -v gh >/dev/null 2>&1 || { echo "ERROR: gh CLI not installed — https://cli.github.com" >&2; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "ERROR: not logged in — run 'gh auth login --scopes repo,workflow'" >&2; exit 1; }

REPO="${GH_REPO:-toxykdude/TRT}"
APP_SECRETS=(
  DATABASE_URL AUTH_SECRET NEXTAUTH_SALT
  OPENAI_API_KEY OPENAI_API_URL OPENAI_MODEL
  RESEND_API_KEY EMAIL_FROM
  GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET
  MCP_AUTH_TOKEN
  WOMPI_ENV WOMPI_PUBLIC_KEY WOMPI_EVENTS_SECRET WOMPI_INTEGRITY_SECRET
  STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET
  STRIPE_PRICE_PLUS_MONTHLY STRIPE_PRICE_PLUS_YEARLY STRIPE_PRICE_PRO_MONTHLY
)

set_secret() { # env_or_empty name value
  local env="$1" name="$2" value="$3"
  if [[ -z "$env" ]]; then
    printf '%s' "$value" | gh secret set "$name" --repo "$REPO"
    echo "   repo secret: $name"
  else
    printf '%s' "$value" | gh secret set "$name" --repo "$REPO" --env "$env"
    echo "   $env secret: $name"
  fi
}

require_vars() { # var names...
  local missing=() empty=()
  for v in "$@"; do
    if [[ -z "${!v+x}" ]]; then
      missing+=("$v")    # not exported at all — real error (typo / forgot to source)
    elif [[ -z "${!v}" ]]; then
      empty+=("$v")      # exported but empty — allowed (DEV stub mode)
    fi
  done
  if [[ ${#missing[@]} -gt 0 ]]; then
    echo "ERROR: these env vars are not exported. Source the right file and retry:" >&2
    printf '   %s\n' "${missing[@]}" >&2
    exit 1
  fi
  if [[ ${#empty[@]} -gt 0 ]]; then
    echo "WARN: these env vars are empty (allowed for DEV stub mode; ensure it's intentional):" >&2
    printf '   %s\n' "${empty[@]}" >&2
  fi
}

CMD="${1:-}"
case "$CMD" in
  # ------------------------------------------------------------------------
  infra)
    echo "=== [$REPO] infra: environments + LXC secrets + branch protection ==="
    require_vars LXC_HOST LXC_SSH_USER LXC_SSH_KEY LXC_KNOWN_HOSTS

    echo "--- Environments ---"
    # -F sends typed values (integer for wait_timer). prevent_self_review is omitted —
    # it's a protection-rule param that requires reviewers to be set, which we don't want
    # (no manual approval gate for this solo-dev setup).
    gh api -X PUT "repos/$REPO/environments/development" \
      -F wait_timer=0 >/dev/null && echo "   ✓ development" \
      || echo "   WARN: development creation failed"
    gh api -X PUT "repos/$REPO/environments/production" \
      -F wait_timer=0 >/dev/null && echo "   ✓ production" \
      || echo "   WARN: production creation failed"

    echo "--- Repo secrets (LXC connection) ---"
    set_secret "" LXC_HOST        "$LXC_HOST"
    set_secret "" LXC_SSH_USER    "$LXC_SSH_USER"
    set_secret "" LXC_SSH_KEY     "$LXC_SSH_KEY"
    set_secret "" LXC_KNOWN_HOSTS "$LXC_KNOWN_HOSTS"

    echo "--- Branch protection on main ---"
    # PUT /branches/{branch}/protection needs a full JSON body — nested objects don't
    # survive flat -f flags reliably. Pass the payload via stdin with --input -.
    # NOTE: "Lint + Typecheck + Test + Build" must match the job name in pr-validation.yml.
    # enforce_admins:false lets the repo owner push directly (chicken-and-egg bypass
    # for the first push of the workflow files themselves).
    gh api -X PUT "repos/$REPO/branches/main/protection" \
      -H "Accept: application/vnd.github+json" \
      --input - <<'PROTECTION' >/dev/null && echo "   ✓ main protected" \
      || echo "   WARN: branch protection failed (needs Administration: write on PAT, or set via repo UI)"
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["Lint + Typecheck + Test + Build"]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": false,
    "require_code_owner_reviews": false,
    "required_approving_review_count": 0
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
PROTECTION
    ;;

  # ------------------------------------------------------------------------
  env)
    ENV_NAME="${2:?usage: setup-github.sh env <development|production>}"
    [[ "$ENV_NAME" == "development" || "$ENV_NAME" == "production" ]] \
      || { echo "ERROR: env must be development or production" >&2; exit 1; }
    echo "=== [$REPO] $ENV_NAME secrets ==="
    require_vars "${APP_SECRETS[@]}"
    for v in "${APP_SECRETS[@]}"; do
      set_secret "$ENV_NAME" "$v" "${!v}"
    done
    echo "   ✓ $ENV_NAME complete"
    ;;

  # ------------------------------------------------------------------------
  *)
    cat <<USAGE
Usage: bash scripts/setup-github.sh <command>

Commands:
  infra              Create environments, set LXC repo secrets, protect main.
                     (exports needed: LXC_HOST, LXC_SSH_USER, LXC_SSH_KEY, LXC_KNOWN_HOSTS)
  env <development|production>
                     Set app secrets for one environment from exported vars.
                     (exports needed: ${APP_SECRETS[*]})

Examples:
  source ~/.trt-secrets-infra.env && bash scripts/setup-github.sh infra
  source ~/.trt-secrets-dev.env   && bash scripts/setup-github.sh env development
  source ~/.trt-secrets-prod.env  && bash scripts/setup-github.sh env production
USAGE
    exit 1
    ;;
esac
