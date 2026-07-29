# SKILL — Project Capabilities & Workflow
> For AI agents working in this repo.
> Not a Gentle AI skill — a project capabilities index.
> Cross-ref: [GOLD.md](./GOLD.md) · [AGENTS.md](./AGENTS.md) · [STATUS.md](./STATUS.md)

## Testing
| Layer | Runner | Command | Notes |
|---|---|---|---|
| Unit / golden | Vitest 2.1.4 | `pnpm test` | Across web, engine, guardrails, ai, kb, mcp. **Strict TDD** (`openspec/config.yaml`). |
| Lint | ESLint | `pnpm lint` | `pnpm -r lint` |
| Typecheck | tsc | `pnpm typecheck` | `@trt/db` is RED (pre-existing debt) — see STATUS.md. |
| Build | Next 15 | `pnpm build` | |
| E2E | Playwright 1.61.1 | `pnpm --filter @trt/web exec playwright test` | **Needs live server + DB + auth** — not headless. W-1 harness pending. |
| Coverage | — | not configured | |

**Suite (green):** web 232/232 · ai 29/29 · guardrails 63/63 · engine 25/25 · kb 7/7 · mcp 24/24.
When you tune an engine rule or change an extraction/guardrail string, update the
corresponding test in the **same PR**.

## SDD Workflow
Hybrid: **OpenSpec files** in `openspec/` + **Engram** persistent memory
(topic keys `sdd/{change-name}/*`).

```
openspec/
├── config.yaml                      # strict_tdd: true, test_command: pnpm test
├── specs/<capability>/spec.md       # synced source of truth (promoted on archive)
└── changes/
    └── archive/<date>-<change>/     # terminal record per change
        ├── proposal.md  specs/  design.md  tasks.md
        ├── apply-progress.md  verify-report.md  archive-report.md
        └── exploration.md  (playwright-harness.md if applicable)
```

**Phase flow:** explore → propose → spec → design → tasks → apply → verify → archive.
- Proposals must trace to GOLD.md + include a rollback plan for risky changes.
- Specs use Given/When/Then + RFC 2119; state consumer-vs-clinician boundaries.
- Designs document safety, `ownerId` scoping, audit, guardrail implications.
- On archive, the delta spec is promoted to `openspec/specs/`.
- Search any change's full trail: `mem_search <change-name>`.

## Clinical Safety Boundaries
GOLD §2 (Prime Directive) governs everything. Summary:
- **Dose recommendations are generated for every authenticated user** (deterministic
  engine) — that is the core product. **Graphiti RAG enhancements** (ancillary
  compounds: hCG/AI/SERM, titration, protocol additions) are **clinician-only**
  (`User.licenseVerifiedAt`, admin-verified).
- **Forbidden on consumer surfaces:** diagnoses/provisional diagnoses; any
  RAG-sourced dosing/protocol content for non-clinicians.
- **Mandatory, non-dismissible disclaimer** on every clinical surface (GOLD §2.5);
  first-login consent recorded to `ConsentRecord`.
- **Every consumer-bound payload passes `packages/guardrails` → `assertConsumerSafe`
  and fails closed.** There is exactly one canonical guardrail implementation — no
  second copy anywhere.
- **Medication overlays on consumer surfaces are timing-only** — `Medication.dose`
  is stored but never rendered consumer-bound. A dosing-pattern *name* is omitted +
  audited, never thrown.
- **MCP server is retrieval-only** — never generates dosing; flagged passages carry
  `contentAdvisory`, never blocked (cited source material).

## Database & Tenancy
- **`prismaFor(userId)` is BYPASSRLS** (`packages/db/src/index.ts`) — returns the
  generic client. **Postgres RLS is NOT the tenancy gate at the app layer.**
- **Every read MUST filter `where: { ownerId }`; every write MUST bind `ownerId`
  from `auth()`** and ignore client-supplied values. A missing `ownerId` =
  cross-tenant PHI leak (the 2026-07 `timeline/page.tsx` leak is the cautionary tale).
- RLS is still required on every patient-data table as defense-in-depth.
- **Audit log** row on every create/update/delete of patient data.
- Storage bucket for labs is **private** — signed URLs only.
- Support data export + deletion (right to be forgotten) in Settings.

## Deployment
CI/CD is the **only** deploy path (2026-07 onward). GitHub is the single source of truth.

| Workflow | Trigger | Target |
|---|---|---|
| `pr-validation.yml` | PR → main | gate (lint + typecheck + test + build) |
| `deploy-dev.yml` | PR → main / push → `feature/*` | DEV |
| `deploy-production.yml` | push → main | PROD |
| `rollback.yml` | manual dispatch | PROD |

Self-hosted runner `trt-lxc` **is** the LXC (`10.162.36.45`). Deploy script
`scripts/ci-deploy.sh`: pull → `pnpm install --frozen-lockfile` → `prisma migrate
deploy` → `pnpm --filter @trt/web build` → `pm2 reload --update-env` → append
`/var/log/trt-deploy.log`. `.env.local` is **rendered from GitHub Environment
secrets** — never hand-edit on the box. See `docs/DEPLOYMENT.md`.
