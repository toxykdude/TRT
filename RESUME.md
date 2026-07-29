# RESUME — Where We Left Off
> Last updated: 2026-07-29
> Cross-ref: [STATUS.md](./STATUS.md) · [AGENTS.md §1.5](./AGENTS.md) · [GOLD.md](./GOLD.md)

## Last Completed
**Full SDD cycle + delivery of `streamline-upload-to-insight`** — the end-to-end
upload→auto-extract→confirm→insight loop. Shipped to production 2026-07-29 via
PRs #8, #9, #10 (main HEAD `5996f70`, all deploys green).

- SDD phases completed: explore → propose → spec → design → tasks → apply (Strict
  TDD, 2 slices S1/S2) → verify (PASS WITH WARNINGS, 0 CRITICAL) → archive.
- 7 requirements / 14 scenarios in the synced spec
  (`openspec/specs/upload-to-insight-workflow/spec.md`).
- Archive trail: `openspec/changes/archive/2026-07-28-streamline-upload-to-insight/`.
- Tests green: web 232/232, ai 29/29, guardrails 63/63, engine 25/25, kb 7/7, mcp 24/24.
- DEV Cloudflare tunnel **restored** (was broken — missing DNS record + ingress).

## Immediate Next Steps
1. **W-1 — run the manual Playwright harness** (blocks next prod merge only).
   5 scenarios in `openspec/changes/archive/2026-07-28-streamline-upload-to-insight/playwright-harness.md`:
   upload→auto-extract→insight · 402 quota dialog · retry-after-failure ·
   review→confirm→analysis · disclaimer non-dismissible. Requires live DEV + DB + auth.
2. **S-3 — opportunistic parity fix** (non-blocking): add `ownerId` to the
   `extract/route.ts:228-231` FAILED-flip `update({where:{id}})`. Tenancy already
   safe upstream; defense-in-depth only.
3. **DEV tunnel sanity-check** post-restore — confirm `dev.my-testo.com` serves the app.

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

## Key Decisions Made
| Decision | Rationale |
|---|---|
| Auto-extract after upload (not manual button) | Core loop must be demonstrable in one action. |
| Users confirm uncertain AI values before analysis | Protects analysis accuracy; CONFIRMED-only invariant downstream. |
| FREE tier = 1 extraction | Lets the core loop run end-to-end for free users. |
| Patients nav visible to all authenticated users | Patient-first product. |
| Idempotent metering (gate new attempts only) | FAILED→EXTRACTING retries must not double-charge. |
| Delivery as auto-chain, stacked-to-main, `size:exception` for PR2 | Reviewable slices; PR2 ~56% test code justified the exception. |

## Environment Notes
- **SSH:** `root@10.162.36.45` — prod at `/opt/trt` (pm2 `trt`), DEV at `/opt/trt-dev` (pm2 `trt-dev`).
- **`.env.local` is rendered from GitHub Environment secrets on every deploy** — do NOT hand-edit on the box.
- **Cloudflare tunnel:** remotely-managed (token-file service), config NOT a local YAML. Changes via Cloudflare API or dashboard. Tunnel ID `26903a94-e8e1-4c0a-b5f2-abbb9fdbc256`.
- **Credentials location:** workspace `.env` currently holds Stripe keys, Cloudflare token, Resend key as plaintext notes — follow-up: move to GitHub Environment secrets / secret manager.
- **AI config:** `OPENAI_API_KEY`, `OPENAI_API_URL=https://api.z.ai/api/coding/paas/v4`, `OPENAI_MODEL=glm-4.6v`. Stub runs locally when key unset.
