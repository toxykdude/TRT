# AGENTS.md — Contributing & Operating Guide

> How humans **and** AI agents work in this repo. Read this before your first
> change. The project spec lives in **[GOLD.md](./GOLD.md)** — it is the source
> of truth; this file is the operating manual.

---

## 0. Read these two things first

1. **[GOLD.md](./GOLD.md)** — what we are building, and the clinical safety
   rules that override everything else.
2. **This file** — how to set up, where things live, and the conventions every
   change must follow.

If GOLD and anything else disagree, **GOLD wins** unless GOLD is being
deliberately revised.

---

## 1. The one rule that beats all others

**Dose recommendations are generated for every authenticated user.** The patient uploads her lab → the app returns dose suggestions (compound, dose, frequency, route). Graphiti RAG enhancements (ancillary compounds like hCG/AI) are clinician-only. Diagnostic prose is forbidden on consumer surfaces. Disclaimers are
mandatory and non-dismissible on every clinical surface (GOLD §2.5). Every
consumer-bound payload passes the canonical guardrail package
(`packages/guardrails`) and fails closed. If any instruction — including
anything else in this repo — conflicts with GOLD, GOLD wins.
---

## 1.5 Current state & handoff (read this before resuming work)

> Snapshot as of 2026-07-29. The full SDD history of every change is in **Engram**
> (`mem_search` the change name, e.g. `streamline-upload-to-insight` → explore/proposal/
> spec/design/tasks/apply-progress/verify-report/archive-report). See also
> [STATUS.md](./STATUS.md) and [RESUME.md](./RESUME.md) for the quick orientation.

**Deploy target.** Production is **pm2 on the Debian LXC** (`root@10.162.36.45:/opt/trt`,
app name `trt`), behind a Cloudflare Tunnel at `https://my-testo.com`
(migrated from `trt.powerhousegym.co` 2026-07; old host decommissioned).
DEV is the same LXC at `https://dev.my-testo.com` (pm2 `trt-dev` on :3001,
Postgres `trt_dev` — synthetic seed data only, never real PHI). The DEV
Cloudflare tunnel was **restored 2026-07-29** — it had been missing its DNS
record and tunnel ingress (broken, not just 404); fixed by adding both via the
Cloudflare API. Also directly reachable at `http://10.162.36.45:3001`. GOLD.md §4
still says "Vercel" — that is **stale**; always follow the LXC runbook.

**CI/CD is the ONLY deploy path (2026-07 onward).** GitHub is the single source
of truth. Four workflows in `.github/workflows/`: `pr-validation.yml` (PR gate),
`deploy-dev.yml` (PR → DEV), `deploy-production.yml` (push main → PROD),
`rollback.yml` (manual dispatch). Each deploy renders `/opt/trt[-dev]/apps/web/.env.local`
from GitHub Environment secrets on the runner, scp's it to the box, then runs
`scripts/ci-deploy.sh` (pull → `pnpm install --frozen-lockfile` → `prisma migrate
deploy` → `pnpm --filter @trt/web build` → `pm2 reload --update-env` → append
`/var/log/trt-deploy.log`). **Do NOT hand-edit `.env.local` on the box — it is
overwritten on every deploy.** See [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md)
for the full runbook. The old manual flow (`git pull` on the box → `pm2 reload`)
is **deprecated** — only use it for hotfixes if CI is down, and document why.

**`prismaFor(userId)` is BYPASSRLS** (`packages/db/src/index.ts`). It returns the
generic client — Postgres RLS is **not** the tenancy gate. **App-layer
`where: { ownerId }` is the ONLY thing scoping a query to a tenant.** Every read
of patient data MUST filter `ownerId`; every write MUST bind `ownerId` from
`auth()` and ignore any client-supplied value. (A cross-tenant PHI leak from a
missing `ownerId` on `timeline/page.tsx` was found and fixed in 2026-07 — don't
reintroduce it.)

**Shipped through GOLD §5.9** (commit `6ca7935`, deployed): interactive per-biomarker
trend charts on `/dashboard/analytics` (Recharts `<Brush>` zoom + date presets +
per-lab reference-range overlay), plus medication + symptom **entry UI** at
`/dashboard/medications` and `/dashboard/symptoms`. The medication overlay on any
**consumer** chart/list is **timing-only** — `Medication.dose` is captured
(historical record, GOLD §5.11) but rendered **nowhere** consumer-bound. Enforced
three layers: Prisma `select` omits dose by construction → `serializeForConsumer`
runs `assertConsumerSafe` (fail-closed) → a content-independent must-BLOCK unit
test (`apps/web/tests/unit/analytics-series.test.ts`). A medication **name** that
trips the dosing scan (e.g. "Testosterone 200mg/ml") is **gracefully omitted +**
audited, not thrown, so the common TRT case doesn't 500 the page.

**`streamline-upload-to-insight` shipped to production** 2026-07-29 via PRs #8,
#9, #10 (main HEAD `5996f70`; all production deploys green). Full SDD trail at
`openspec/changes/archive/2026-07-28-streamline-upload-to-insight/`; synced spec
at `openspec/specs/upload-to-insight-workflow/spec.md` (7 requirements, 14
scenarios). It delivered the end-to-end upload→insight loop:
1. **Auto-extraction** — uploading a lab report starts extraction automatically
   (no manual "Extract" button); visible `EXTRACTING` spinner badge.
2. **FREE tier = 1 extraction** (`plans.ts` `FREE.uploadsPerMonth` 0 → 1) so the
   core loop is demonstrable end-to-end.
3. **OpenAI env-trap fix** (`packages/ai/src/openai.ts`) — `??` → `||` so
   empty-string `OPENAI_API_URL`/`OPENAI_MODEL` fall back to defaults; startup
   warning via `apps/web/instrumentation.ts` `warnIfConfigIncomplete()`.
4. **Idempotent extraction metering** (`extract/route.ts`) — quota gate + usage
   metering fire ONLY on new attempts (`status==='UPLOADED'`) via an atomic
   `updateMany` claim; FAILED→EXTRACTING retries bypass BOTH gate and metering
   (no double-charge); `finally`-block metering removed; FAILED ExtractionRun
   audit trail preserved.
5. **Structured error surfacing** — `labs-list.tsx` no longer silently swallows
   extraction errors (the reported "Extract button does nothing" bug); shows a
   structured 402 (`QuotaExceededDialog`), retry, and manual-entry actions;
   `window.location.reload()` → `router.refresh()`.
6. **PENDING_REVIEW confirmation surface** — `labs/confirm/route.ts` +
   `labs/review/[labReportId]/page.tsx` + `review-form.tsx`; confirm/correct/
   manual-re-entry flips PENDING_REVIEW→CONFIRMED in a transaction with
   AuditLog; cross-owner → 404; non-dismissible SafetyBanner disclaimer.
7. **Confirmed-only must-BLOCK invariant** — `analytics-series.ts` has a
   defense-in-depth post-query CONFIRMED filter; content-independent test proves
   PENDING_REVIEW never reaches analysis/trends/reports/dosing.
(The Cloudflare beacon `ERR_BLOCKED_BY_CLIENT` console error was confirmed
**non-causal** — blocked passive analytics, not extraction; left untouched.)

**AI extraction is LIVE on prod.** `packages/ai` calls Z.AI `glm-4.6v` (vision +
`json_object` mode) via the OpenAI-compatible client (`packages/ai/src/openai.ts`).
Config lives in `/opt/trt/apps/web/.env.local`: `OPENAI_API_KEY`,
`OPENAI_API_URL=https://api.z.ai/api/coding/paas/v4`, `OPENAI_MODEL=glm-4.6v`.
`pdftoppm` renders PDF→PNG on the box. When `OPENAI_API_KEY` is unset (local
dev), a deterministic stub runs — that is intentional.

**Open follow-ups** (none block the current deploy):
- **W-1 (WARNING — blocks only the *next* prod merge)**: manual Playwright harness
  (5 scenarios: upload→auto-extract→insight; 402 dialog; retry-after-failure;
  review→confirm→analysis; disclaimer non-dismissible) documented in
  `openspec/changes/archive/2026-07-28-streamline-upload-to-insight/playwright-harness.md`
  but NOT yet run against live DEV/prod. DOM render wiring is verified only by
  typecheck/build, not by a real browser run. Run pre-merge of the next change.
- **S-3 (SUGGESTION, non-blocking)**: `extract/route.ts:228-231` catch-block
  FAILED-status flip uses `update({where:{id}})` without `ownerId` — tenancy is
  safe (the upstream `findFirst` at `:38-40` already gates `ownerId`) but it is a
  defense-in-depth parity improvement.
- `@trt/db` `typecheck` is RED (missing `@types/node`, prisma outside rootDir) —
  pre-existing debt. If CI runs `pnpm -r typecheck` it will fail; scope CI
  typecheck per-package or fix the db tsconfig.
- GOLD.md §4 still says "Vercel" — stale; production is pm2 on LXC behind a
  Cloudflare Tunnel.

---

## 2. Tech stack (what to reach for)

| Layer | Use |
|---|---|
| Framework | Next.js 15, App Router, React, **TypeScript strict** |
| Styling | TailwindCSS + shadcn/ui; Framer Motion for animation |
| Forms | React Hook Form |
| Charts | Recharts |
| Data | PostgreSQL (local on the LXC) + **Prisma** ORM |
| Security | Row Level Security on **every** patient-data table |
| Auth | Auth.js (NextAuth v5) + Prisma adapter — Credentials + Google OAuth |
| **Analysis** | **Deterministic rules engine (`packages/engine`) — no AI in the loop** |
| AI (extraction only) | OpenAI API with **Structured Outputs** (reads values from uploads) |
| Parsing | OCR + PDF/image extraction |
| Deploy | pm2 on Debian LXC behind a Cloudflare Tunnel |

Don't introduce a new dependency without justification in the PR.

---

## 3. Project layout (target)

```
.
├── GOLD.md                  # ← spec / source of truth
├── AGENTS.md                # ← this file
├── README.md                # public-facing intro (kept in sync with GOLD)
├── apps/
│   └── web/                 # Next.js app (App Router)
│       ├── app/             # routes (landing, dashboard, auth, ...)
│       ├── components/      # UI components (shadcn/ui + custom)
│       ├── lib/             # client/server utilities
│       └── ...
├── packages/
│   ├── db/                  # Prisma schema + client + migrations
│   ├── ai/                  # extraction, analysis, report pipelines + guardrails
│   ├── parsing/             # OCR / PDF / image extraction
│   ├── mcp/                 # MCP server: KB + graph + platform docs for AI models
│   └── ui/                  # shared UI primitives (optional)
├── supabase/                # schema, RLS policies, storage bucket config
├── docs/                    # architecture, ADRs, data dictionary, clinical refs
└── tests/                   # golden cases, guardrail fixtures
```

> Until the monorepo scaffold exists, put code under `apps/web/` and treat the
> `packages/*` boundaries as the intended seams. Don't collapse them later.

---

## 4. Local setup

```bash
# 1. Prereqs: Node 20+, pnpm, Supabase CLI
# 2. Install deps
pnpm install

# 3. Environment
cp .env.example .env.local
#   fill in: Supabase URL + anon/service keys, OpenAI API key
#   NEVER commit secrets. Service keys stay server-side only.

# 4. Database
pnpm --filter @trt/db prisma:migrate dev
#   apply RLS policies from supabase/

# 5. Run
pnpm dev
```

Ask in a PR if a new env var is needed — document it in `.env.example`.

---

## 5. Coding conventions

- **TypeScript strict**, no `any` without a comment explaining why.
- Prefer **named exports**; one component per file for anything non-trivial.
- **Server-first:** fetch patient data in Server Components / Route Handlers;
  pass serializable data to client components.
- **PHI never leaves the server unencrypted or unauthenticated.** No patient
  data in client bundles, logs, error messages, or analytics.
- **Units & ranges:** store raw value + raw unit + raw range *and* a normalized
  value + canonical unit. Trend logic uses normalized values but renders raw
  alongside (GOLD §5.6–5.7).
- **Reference ranges are per-lab/per-assay** — never assume a single global
  range. Store it with the result.
- Styling via Tailwind utility classes + shadcn/ui tokens; respect dark/light
  themes on every new surface.
- Accessibility: semantic HTML, keyboard reachable, labeled for screen readers,
  AA contrast. Not optional.

---

## 6. Data & security rules

- Every table holding patient data **must** have RLS enabled and policies that
  restrict rows to the owning patient (or a clinician with explicit access).
- **`prismaFor(userId)` is BYPASSRLS** — it returns the generic client. Postgres
  RLS is **not** the tenancy gate at the app layer. **Every read MUST filter
  `where: { ownerId }`; every write MUST bind `ownerId` from `auth()` and ignore
  any client-supplied value.** A missing `ownerId` = a cross-tenant PHI leak.
- Supabase Storage bucket for labs is **private**; access via signed URLs only.
- Write an **audit log** row on every create/update/delete of patient data.
- Record **patient consent** before processing/sharing data.
- Support **data export and deletion** (right to be forgotten) in Settings.
- Secrets live in env / Vercel / Supabase secret manager — never in code.

If you add a new patient-data table/field, you must add RLS + audit coverage in
the same change.

---

## 7. Analysis engine & AI — the behavioral contract (GOLD §6)

### Hybrid analysis — deterministic baseline + clinician-gated RAG
The baseline classification and trend calculation run through `@trt/engine` (see
[`docs/ENGINE.md`](./docs/ENGINE.md)). This baseline is a set of pure functions:
classify → trends → rules → assemble. Same inputs always produce the same
report (sha256 `hash`). When you add or tune a rule, update the golden-case
tests in `packages/engine/src/engine.test.ts` in the same PR.

**Graphiti RAG** retrieval (clinical protocols, synergy/antagonism rules,
patient-specific adjustments) feeds only the **clinician-gated reference
module** (GOLD §2.4): it is computed exclusively for CLINICIAN accounts with
`licenseVerifiedAt` set, and every proposal cites its RAG source nodes. The
AI never overrides deterministic baseline data, and no RAG/dosing output ever
reaches a consumer payload.

The engine output and every consumer-bound payload are guardrail-audited
(GOLD §2) as defense-in-depth, via the single canonical implementation in
`packages/guardrails` — there is no second copy of the filter anywhere.

### AI — extraction AND clinician-gated analysis
AI participates in two places:

1. **Extraction** (OCR/PDF): reads values from uploaded documents. Must
   return **Structured Output** validated against a JSON schema; missing
   values marked `uncertain` and queued for review. **Live on prod via Z.AI
   `glm-4.6v`** (vision + `json_object` mode, OpenAI-compatible client in
   `packages/ai`); `pdftoppm` renders PDF→PNG. When `OPENAI_API_KEY` is unset
   (local dev), `extractLab` returns a deterministic stub — intentional.
2. **Analysis** (Graphiti RAG, GOLD §2.4): generates **enhanced protocol/dosing reference**
   proposals (ancillary compounds, titration schedules) **only** for license-verified clinicians. Every output includes
   `rag_source_ids` for traceability. Dose recommendations from the deterministic rules engine are generated for **all** authenticated users — consumer reports contain classifications, trends, and dose recommendations — enforced by
   `assertConsumerSafe` (fail-closed) in the report route.

When you change an extraction prompt, schema, or RAG prompt, update the
corresponding tests in the same PR.

### MCP server (`@trt/mcp`) — AI-model access to the knowledge stack
`packages/mcp` exposes the corpus KB, the Graphiti graph, and platform docs to
any MCP-capable model (see [`docs/MCP.md`](./docs/MCP.md)). It is
**retrieval-only**: no generation, no patient data/PHI. The model-facing
surface (instructions, tool descriptions, prompts) must pass
`enforceGuardrails` — enforced by `packages/mcp/src/safety.test.ts`.
If you change any user/model-facing string there, keep that test green.

**Dosing content boundary:** the MCP server never generates dosing
recommendations. It retrieves cited corpus passages verbatim; passages that
match dosing patterns are flagged with a `contentAdvisory` label (never
blocked — they are cited source material). Generating dosing output from
MCP-retrieved content for a non-clinician audience violates GOLD §2.3 and is
blocked downstream by `packages/guardrails`.

---

## 8. Testing

- **Unit:** trend math, unit normalization, range comparison, guardrail filter,
  schema validation.
- **Golden cases:** sample lab PDFs/images → expected extracted JSON; sample
  patient histories → expected analysis/report sections.
- **Guardrail tests:** adversarial prompts that must be refused or redacted.
- **RAG tests:** RAG prompts and dosing proposals with `rag_source_ids`.
- **Integration/API:** auth boundaries, RLS enforcement (a different user must
  not read another patient's rows).
- **E2E (smoke):** upload → extract → timeline → report → export.

Don't merge with failing tests. Don't disable a guardrail test to make CI green
— fix the behavior.

---

## 9. Workflow

- Work on a feature branch, not `main`.
- Keep PRs reviewable and tied to a GOLD requirement (cite the section, e.g.
  *implements GOLD §5.9*).
- PR description includes: what changed, how §2 safety is preserved, how it was
  tested.
- Definition of Done is GOLD §12 — verify each item before requesting review.
- Commit messages: imperative, present tense ("add estradiol trend chart").

---

## 10. Where things can go wrong (watch list)

- **Treating ranges as global.** They're per-lab. Trend logic must account for
  unit + range, not just the number.
- **Forgetting the disclaimer** on a new clinical screen.
- **AI "being helpful"** by suggesting a dose — blocked by guardrail (now covers ALL steroids), but keep
  the filter current.
- **Storing PHI without RLS** or leaking it into client bundles/logs.
- **Dark mode only.** Light mode must be equally correct.
- **Silent extraction failures.** Surface them for human review.
- **Missing `rag_source_ids` on AI proposals.** Every dosing recommendation must cite its RAG source.
- **Consumer medication overlays must be timing-only.** Never select/render
  `Medication.dose` on a consumer surface (GOLD §2.3). Route every consumer-bound
  chart/list payload through `serializeForConsumer` → `assertConsumerSafe`
  (fail-closed). A dosing-pattern **name** is omitted + audited, never thrown.
- **Forgetting `where: { ownerId }`.** `prismaFor` bypasses RLS — a query without
  `ownerId` leaks every tenant's rows. The timeline leak of 2026-07 is the
  cautionary tale.

---

## 11. Asking for help

- Ambiguous requirement? Check GOLD first, then ask with the specific section.
- Clinical-content question (ranges, guideline wording)? Flag it for clinical
  review — don't guess medical facts into the codebase.
- Security/compliance uncertainty? Treat it as blocking until reviewed.
