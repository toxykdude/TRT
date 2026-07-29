# RESUME — Where We Left Off
> Last updated: 2026-07-29
> Cross-ref: [STATUS.md](./STATUS.md) · [AGENTS.md §1.5](./AGENTS.md) · [GOLD.md](./GOLD.md)

## Last Completed
**Diagnosed and fixed the prod Auth.js `error=Configuration` dead-end** (PR #11,
`fix/auth-error-page`). Merged + deployed to production 2026-07-29 (main HEAD
`8fd9b08`). Ad hoc fix — not an SDD change, no `openspec/` folder; full trail in
Engram (`mem_search "auth-error-page"` / `"InvalidCheck"`).

- Root cause: Auth.js flattens every throw outside its `clientErrors` allowlist
  to `?error=Configuration`. Prod's actual failure was `InvalidCheck` — an
  expired `__Secure-authjs.pkce.code_verifier` cookie (`Max-Age=900`) — which a
  retry fixes, but the built-in page presents it as a fatal server fault.
  Confirmed by reading `pm2 logs trt` on the LXC and a live PKCE round-trip
  against `my-testo.com`; ruled out `AUTH_SECRET` rotation, Google credential
  mismatch, and a missing migration along the way (all checked, all fine).
- Added `presentAuthError` (closed exact-match table, `?error=` never
  reflected) + a localized `/auth-error` page in the `(auth)` route group.
- Fixed the always-broken `theme.logo`/favicon 404s by committing
  `apps/web/public/icon.svg` — the **first** git-tracked file under
  `apps/web/public/`.
- Verified end-to-end on the real build, DEV, and prod (post-deploy): the real
  `/api/auth/callback/google` failure path now lands on the new page in both
  locales; non-retryable codes render "back to sign in"; a hostile `?error=`
  does not reflect into markup; `/icon.svg` resolves.
- Confirmed `@trt/db` `typecheck` is now **green** (was flagged RED in every
  doc) and propagated that correction to STATUS.md, AGENTS.md, CLAUDE.md, and
  SKILL.md in the same pass — see AGENTS.md §1.6.

**Previously completed — full SDD cycle + delivery of `streamline-upload-to-insight`**
— the end-to-end upload→auto-extract→confirm→insight loop. Shipped to production
2026-07-29 via PRs #8, #9, #10.

- SDD phases completed: explore → propose → spec → design → tasks → apply (Strict
  TDD, 2 slices S1/S2) → verify (PASS WITH WARNINGS, 0 CRITICAL) → archive.
- 7 requirements / 14 scenarios in the synced spec
  (`openspec/specs/upload-to-insight-workflow/spec.md`).
- Archive trail: `openspec/changes/archive/2026-07-28-streamline-upload-to-insight/`.
- Tests green: web 239/239, ai 29/29, guardrails 63/63, engine 25/25, kb 7/7, mcp 24/24.
- DEV Cloudflare tunnel **restored** (was broken — missing DNS record + ingress).

## Immediate Next Steps
1. **W-1 — run the manual Playwright harness** (blocks next prod merge only).
   5 scenarios in `openspec/changes/archive/2026-07-28-streamline-upload-to-insight/playwright-harness.md`:
   upload→auto-extract→insight · 402 quota dialog · retry-after-failure ·
   review→confirm→analysis · disclaimer non-dismissible. Requires live DEV + DB + auth.
2. **S-3 — opportunistic parity fix** (non-blocking): add `ownerId` to the
   `extract/route.ts:228-231` FAILED-flip `update({where:{id}})`. Tenancy already
   safe upstream; defense-in-depth only.
3. **Decide on `apps/web/public/brand/*`** — 4 untracked logo concept SVGs +
   README. `public/icon.svg`'s provenance comment already references
   `my-testo-monogram.svg`; commit the brand set (or repoint the comment) so
   that reference isn't dangling.
4. **GOLD.md §4 Supabase divergence** — needs a deliberate product-owner
   decision (rewrite GOLD to match the real stack, or explain the intentional
   gap), not a silent doc sync. See STATUS.md → Open Follow-ups.

## Session History
1. **Explore** — mapped the upload→insight gap (manual Extract button, silent
   errors, FREE=0 wall, OpenAI env-trap). Decision artifact in Engram.
2. **Propose → Spec → Design → Tasks** — 7 requirements, 14 scenarios, atomic task plan.
3. **Apply (Strict TDD)** — two slices: S1 (auto-extract + metering + env-trap +
   error surfacing) and S2 (review/confirm surface + confirmed-only must-BLOCK +
   tenant isolation + hardening). 7 commits total.
4. **Verify** — full-change verify PASS WITH WARNINGS; S1/S2 phase-contract checks passed.
5. **Delivery** — auto-chain, stacked-to-main; PR2 shipped with maintainer-accepted
   `size:exception` (1,568 lines, ~56% tests).
6. **Archive** — delta spec promoted; terminal record finalized.
7. **Infra fix** — restored DEV Cloudflare tunnel via API.
8. **Prod incident diagnosis** — user reported "Server error / problem with the
   server configuration" on Google login. Black-box curl probes against
   `my-testo.com` (csrf/providers/session all `200`, OTP path healthy, signin
   step healthy) narrowed the throw to the OAuth callback before touching the
   box. SSH'd into the LXC (`-i /root/.ssh/faceapp` is required — plain
   `ssh root@...` gets `Permission denied`), read `pm2 logs trt`, found
   `InvalidCheck: pkceCodeVerifier value could not be parsed`, and traced it
   through the installed `@auth/core` source to the `Configuration` bucket.
9. **Fix + ship `fix/auth-error-page`** — TDD (`presentAuthError` test written
   RED first, 7 cases), localized `/auth-error` page, `icon.svg`/favicon fix.
   Verified on a locally-started build, then DEV, then prod post-deploy via
   direct curl checks (not just CI green). Branched off `main`, 2 conventional
   commits, PR #11, merged, prod auto-deployed via `deploy-production.yml`.

## Key Decisions Made
| Decision | Rationale |
|---|---|
| Auto-extract after upload (not manual button) | Core loop must be demonstrable in one action. |
| Users confirm uncertain AI values before analysis | Protects analysis accuracy; CONFIRMED-only invariant downstream. |
| FREE tier = 1 extraction | Lets the core loop run end-to-end for free users. |
| Patients nav visible to all authenticated users | Patient-first product. |
| Idempotent metering (gate new attempts only) | FAILED→EXTRACTING retries must not double-charge. |
| Delivery as auto-chain, stacked-to-main, `size:exception` for PR2 | Reviewable slices; PR2 ~56% test code justified the exception. |
| Custom Auth.js error page instead of the `@auth/core` default | The `Configuration` bucket is dominated by a benign expired-PKCE-cookie condition (`InvalidCheck`); users need a retry path, not a message that says the server is broken. |
| Ship `icon.svg` as a crop of the existing monogram concept, not wait for final branding | Unblocks the `theme.logo`/favicon 404s now; the final brand asset choice (`public/brand/*`) is a separate, still-open decision. |

## Environment Notes
- **SSH:** `ssh -i /root/.ssh/faceapp root@10.162.36.45` — the `-i` flag is
  REQUIRED; plain `ssh root@10.162.36.45` fails with `Permission denied
  (publickey,password)`. Prod at `/opt/trt` (pm2 `trt`), DEV at `/opt/trt-dev`
  (pm2 `trt-dev`).
- **`.env.local` is rendered from GitHub Environment secrets on every deploy** — do NOT hand-edit on the box.
- **Cloudflare tunnel:** remotely-managed (token-file service), config NOT a local YAML. Changes via Cloudflare API or dashboard. Tunnel ID `26903a94-e8e1-4c0a-b5f2-abbb9fdbc256`.
- **Credentials location:** workspace `.env` currently holds Stripe keys, Cloudflare token, Resend key as plaintext notes — follow-up: move to GitHub Environment secrets / secret manager.
- **AI config:** `OPENAI_API_KEY`, `OPENAI_API_URL=https://api.z.ai/api/coding/paas/v4`, `OPENAI_MODEL=glm-4.6v`. Stub runs locally when key unset.
- **`@trt/db` `typecheck` is GREEN** — confirmed 2026-07-29. Ignore any older
  doc still calling it RED; that was pre-existing debt that has since been fixed.
- **`gh pr edit <n> --add-label` fails silently on this repo** — it throws a
  Projects-classic GraphQL deprecation error and does NOT apply the label. Use
  `gh api -X POST repos/:owner/:repo/issues/<n>/labels -f 'labels[]=type:bug'`
  instead, and re-read labels to confirm.
