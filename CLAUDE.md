# CLAUDE.md — TRT Project (Claude Code entry point)

TRT is a **TRT/hormone-health lab-report analysis platform**: a patient uploads
bloodwork → the deterministic engine returns dose recommendations + biomarker
trend insights. Patient-first; clinician features are roadmap/gated.

> Read in this order: **[GOLD.md](./GOLD.md)** (source of truth) →
> **[AGENTS.md](./AGENTS.md)** (operating manual) → **[STATUS.md](./STATUS.md)**
> (current state) → **[RESUME.md](./RESUME.md)** (where we left off).

## Read STATUS.md for current state
**[STATUS.md](./STATUS.md)** is the always-current snapshot. Start there before
touching anything.

## Safety rules (non-negotiable)
- **GOLD wins.** If anything conflicts with [GOLD.md](./GOLD.md), GOLD is right
  unless GOLD is being deliberately revised. See GOLD §2 (Prime Directive).
- **Consumer payloads fail closed.** Every consumer-bound output goes through the
  canonical `packages/guardrails` → `assertConsumerSafe`. Diagnostic prose and
  RAG/protocol dosing are clinician-only. Disclaimers are mandatory +
  non-dismissible on every clinical surface (GOLD §2.5).
- **`ownerId` binding is mandatory.** `prismaFor(userId)` is BYPASSRLS — Postgres
  RLS is NOT the tenancy gate. Every read filters `where: { ownerId }`; every
  write binds `ownerId` from `auth()`. A missing `ownerId` = cross-tenant PHI leak.

## Commands
| Task | Command |
|---|---|
| Dev server | `pnpm dev` |
| Tests (all workspaces) | `pnpm test` |
| Build (Next.js) | `pnpm build` |
| Lint | `pnpm lint` |
| Typecheck | `pnpm typecheck` |
| DB migrate (dev) | `pnpm --filter @trt/db prisma:migrate dev` |

`@trt/db` `typecheck` is RED (pre-existing debt) — see STATUS.md → Open Follow-ups.

## Project layout
```
apps/web/              # Next.js 15 App Router (routes, components, lib)
packages/
├── db/                # Prisma schema + client + migrations
├── ai/                # extraction (Z.AI glm-4.6v), analysis, report pipelines
├── engine/            # deterministic rules engine (classify → trends → rules)
├── guardrails/        # canonical consumer-safety filter (assertConsumerSafe)
└── mcp/               # retrieval-only MCP server (KB + graph + platform docs)
openspec/              # SDD artifacts (changes/, specs/)
docs/                  # architecture, deployment, engine, mcp docs
```

## Engram + SDD
This repo uses **hybrid Spec-Driven Development**: OpenSpec files in `openspec/`
plus **Engram** persistent memory. SDD history is searchable — `mem_search` the
change name (e.g. `streamline-upload-to-insight`) to pull explore/proposal/spec/
design/tasks/apply/verify/archive artifacts. Phase flow:
explore → propose → spec → design → tasks → apply → verify → archive.
Config: `openspec/config.yaml` (`strict_tdd: true`, `test_command: pnpm test`).

See **[SKILL.md](./SKILL.md)** for the full capabilities/workflow index.
