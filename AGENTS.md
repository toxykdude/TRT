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

This is a **clinical decision *support*** tool, not a prescribing or diagnostic
system. From GOLD §2:

- **Never** generate a prescription.
- **Never** recommend an exact dosage of testosterone, hCG, or an aromatase
  inhibitor, or any medication schedule/titration.
- **Never** render a diagnosis or tell a user to start/stop/change a medication.
- **Always** keep the mandatory disclaimer on every clinical surface:

  > "This software provides educational and organizational support only. It does
  > not diagnose medical conditions or prescribe treatment. All treatment
  > decisions must be made by a qualified healthcare professional."

These rules apply to **UI text, AI prompts, AI outputs, reports, tests, and
documentation alike.** If your change touches anything AI- or report-related,
add or extend a guardrail test. See GOLD §2 and §6.

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
- Supabase Storage bucket for labs is **private**; access via signed URLs only.
- Write an **audit log** row on every create/update/delete of patient data.
- Record **patient consent** before processing/sharing data.
- Support **data export and deletion** (right to be forgotten) in Settings.
- Secrets live in env / Vercel / Supabase secret manager — never in code.

If you add a new patient-data table/field, you must add RLS + audit coverage in
the same change.

---

## 7. Analysis engine & AI — the behavioral contract (GOLD §6)

### Analysis is deterministic — no model in the loop
Analysis and report generation run through `@trt/engine` (see
[`docs/ENGINE.md`](./docs/ENGINE.md)). There is **no AI model in the analysis
path**. The engine is a set of pure functions: classify → trends → rules →
assemble. Same inputs always produce the same report (sha256 `hash`). When you
add or tune a rule, update the golden-case tests in `packages/engine/src/engine.test.ts`
in the same PR.

The engine output is still guardrail-audited (GOLD §2) as defense-in-depth,
even though it's rule-generated.

### AI is scoped to extraction only
The only model usage is reading values from uploaded documents (OCR/PDF). Any
extraction call must:

1. Get the GOLD §2 guardrails **verbatim** in its system prompt.
2. Return **Structured Output** validated against a JSON schema; prose only in
   sanctioned fields.
3. Be run through the **deterministic guardrail pass** that blocks outputs
   matching prohibited patterns (dosages, prescriptions, schedules, diagnoses).
4. Never infer a value that isn't in the source — mark `uncertain` and queue
   for human review instead.

When you change an extraction prompt or schema, update the corresponding
guardrail tests in the same PR.

---

## 8. Testing

- **Unit:** trend math, unit normalization, range comparison, guardrail filter,
  schema validation.
- **Golden cases:** sample lab PDFs/images → expected extracted JSON; sample
  patient histories → expected analysis/report sections.
- **Guardrail tests:** adversarial prompts that must be refused or redacted.
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
- **AI "being helpful"** by suggesting a dose — blocked by guardrail, but keep
  the filter current.
- **Storing PHI without RLS** or leaking it into client bundles/logs.
- **Dark mode only.** Light mode must be equally correct.
- **Silent extraction failures.** Surface them for human review.

---

## 11. Asking for help

- Ambiguous requirement? Check GOLD first, then ask with the specific section.
- Clinical-content question (ranges, guideline wording)? Flag it for clinical
  review — don't guess medical facts into the codebase.
- Security/compliance uncertainty? Treat it as blocking until reviewed.
