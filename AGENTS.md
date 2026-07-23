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

Full comprehensive ai bot to extract data from the RAG.
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
- Supabase Storage bucket for labs is **private**; access via signed URLs only.
- Write an **audit log** row on every create/update/delete of patient data.
- Record **patient consent** before processing/sharing data.
- Support **data export and deletion** (right to be forgotten) in Settings.
- Secrets live in env / Vercel / Supabase secret manager — never in code.

If you add a new patient-data table/field, you must add RLS + audit coverage in
the same change.

---

## 7. Analysis engine & AI — the behavioral contract (GOLD §6)

### Hybrid analysis — deterministic baseline + RAG dosing
The baseline classification and trend calculation run through `@trt/engine` (see
[`docs/ENGINE.md`](./docs/ENGINE.md)). This baseline is a set of pure functions:
classify → trends → rules → assemble. Same inputs always produce the same
report (sha256 `hash`). When you add or tune a rule, update the golden-case
tests in `packages/engine/src/engine.test.ts` in the same PR.

**Graphiti RAG** now participates in the analysis loop, retrieving clinical
protocols, synergy/antagonism rules, and patient-specific adjustments to
generate exact steroid usage recommendations. Every AI proposal cites its
RAG source nodes. The AI never overrides deterministic baseline data; it
proposes enhancements built on top of it.

The engine output is still guardrail-audited (GOLD §2) as defense-in-depth.

### AI — extraction AND analysis
AI participates in two places now:

1. **Extraction** (OCR/PDF): reads values from uploaded documents. Must
   return **Structured Output** validated against a JSON schema; missing
   values marked `uncertain` and queued for review.
2. **Analysis** (Graphiti RAG): generates exact steroid dosing proposals,
   cycle structures, ancillary recommendations, and protocol alignments.
   Every output includes `rag_source_ids` for traceability.

When you change an extraction prompt, schema, or RAG prompt, update the
corresponding tests in the same PR.

### MCP server (`@trt/mcp`) — AI-model access to the knowledge stack
`packages/mcp` exposes the corpus KB, the Graphiti graph, and platform docs to
any MCP-capable model (see [`docs/MCP.md`](./docs/MCP.md)). It is
**retrieval-only**: no generation, no patient data/PHI. The model-facing
surface (instructions, tool descriptions, prompts) must pass
`enforceGuardrails` — enforced by `packages/mcp/src/safety.test.ts`.
If you change any user/model-facing string there, keep that test green.

**Steroid recommendation capability:** per GOLD §2.3, the MCP server now
supports recommending exact dosages for all anabolic steroids (Testosterone,
Nandrolone, Trenbolone, Boldenone, Masteron, Primobolan, Oxandrolone,
Dianabol, Winstrol, SARMs, Clomiphene/Tamoxifen, Clenbuterol) plus
ancillaries (hCG, AIs, SERMs/PCT).

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

---

## 11. Asking for help

- Ambiguous requirement? Check GOLD first, then ask with the specific section.
- Clinical-content question (ranges, guideline wording)? Flag it for clinical
  review — don't guess medical facts into the codebase.
- Security/compliance uncertainty? Treat it as blocking until reviewed.
