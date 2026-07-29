# Design: Streamline Upload to Insight

## Technical Approach

Orchestrate upload → extraction → confirmation (when needed) → deterministic insight as a client-driven state machine over the existing `LabReport.status` / `LabResult.reviewStatus` columns. Upload stays fast and unmetered; the **client auto-chains** extraction after upload returns its `labReportId`, then surfaces structured 402/validation/server errors with `GenerateReportButton` parity. `LabReport` is the idempotency unit — re-extraction stays delete-then-create in one transaction (already true), and metering is guarded by an atomic status claim so retries/concurrency never double-count usage. A new confirm route + review surface lets users confirm/correct/re-enter PENDING_REVIEW values; the already-enforced `reviewStatus:'CONFIRMED'` query invariant keeps unconfirmed data out of analysis/analytics/reports. No RAG/dosing or guardrail boundary changes.

## Architecture Decisions

| Decision | Choice | Rejected | Rationale |
|---|---|---|---|
| Auto-extract trigger | Client chain in `upload-zone` after upload returns `labReportId` | Server-inline in upload route; background job | Vision call is 10–60s — inlining blocks upload; pm2 has no job runner; reuses existing extract route tx/quota unchanged; progress/errors mirror the report flow |
| Progress surfacing | Indeterminate spinner + `EXTRACTING` badge; no poll endpoint | Status-polling | Single vision call per report; polling over-engineers v1; locale-aware redirect on completion |
| Metering + idempotency | Gate + meter **only on new attempts** (`status==='UPLOADED'`), inside an atomic `updateMany where status='UPLOADED'` claim; retries (FAILED→EXTRACTING) bypass quota and metering | Current `finally`-metering; new ledger table | Spec: "metered when attempt starts", "repeated request → one usage record"; atomic claim makes sequential retry free + concurrency-safe; no schema change |
| Confirmation storage | Flip `LabResult.reviewStatus`→CONFIRMED in tx + `AuditLog` row | New confirmation table; `LabResult.confirmedAt` field | `AuditLog` already covers entity/action/detail; avoids a new patient-data table → no new RLS policy (AGENTS §6) |
| Error surfacing | 402→`QuotaExceededDialog`; else inline retry + manual-entry | Silent swallow + `window.location.reload()` (current `labs-list`) | Spec "actionable failure"; parity with `generate-report-button.tsx` |
| `OPENAI_*` empty-string | `??`→`\|\|` (lines 42, 51) + startup `warnIfConfigIncomplete()` | Keep `??` | `"" ?? default === ""`; the documented CI empty-secret trap |

## State Machine

```
UPLOADED ──claim+meter──▶ EXTRACTING
   │                           │
   │                      ┌────┴──────┐
   │                      ▼           ▼
   │                REVIEW_NEEDED    EXTRACTED ──▶ /analysis
   │                      │
   │              confirm/correct/manual ($tx)
   │                      ▼
   │                   EXTRACTED ──▶ /analysis
   └─(any) throw──▶ FAILED ──retry(no meter, no gate)──▶ EXTRACTING
```
`reviewStatus` transitions only PENDING_REVIEW→CONFIRMED via the confirm route; CONFIRMED is terminal per result. New attempts are quota-gated; retries are not.

## Sequence (auto-extract + confirm)

```
UploadZone ─POST /labs/upload──▶ LabReport(UPLOADED) + AuditLog
   │ ◀── { ok, labReportId }
   └─POST /labs/extract {labReportId}──▶ isNewAttempt? checkQuota(UPLOAD) ─402─▶ QuotaExceededDialog
                                         │ ok: atomic claim UPLOADED→EXTRACTING (+ recordUsage once)
                                         │     extractLabWithRun → $tx(deleteMany+create+Run+update)
                                         │ ◀── { pendingReview, mapped, unmapped }
   ◀── pendingReview>0 ? /labs/review/[id] : /dashboard/analysis   (locale-prefixed)
ReviewPage ─POST /labs/confirm──▶ $tx(update reviewStatus, audit) ─▶ /dashboard/analysis
```

## File Changes

| File | Action | What |
|---|---|---|
| `apps/web/.../labs/upload/route.ts` | Modify | Return `{ ok, labReportId }`; persistence/ownerId/audit unchanged |
| `apps/web/src/components/dashboard/upload-zone.tsx` | Modify | Auto-chain extract; spinner; 402 dialog; inline error+retry+manual; locale redirect; pre-upload "uses 1 credit" messaging |
| `apps/web/src/components/dashboard/labs-list.tsx` | Modify | Replace silent swallow + reload with structured 402/error surfacing + `router.refresh()` |
| `apps/web/.../labs/extract/route.ts` | Modify | New-attempt gate + atomic claim + meter-at-start; remove `finally` metering; keep `$tx` + FAILED-run trail |
| `apps/web/.../labs/review/[labReportId]/page.tsx` | Create | Owner-scoped PENDING_REVIEW list → `<ReviewForm>` (confirm/correct/manual) + disclaimer |
| `apps/web/.../labs/confirm/route.ts` | Create | `$tx`: PENDING→CONFIRMED (+corrected value/biomarker), ownerId-bound, audit each row |
| `apps/web/src/lib/plans.ts` | Modify | `FREE.uploadsPerMonth: 0 → 1` |
| `packages/ai/src/openai.ts` | Modify | `??`→`\|\|` (lines 42, 51) + `warnIfConfigIncomplete()` |
| `apps/web/tests/unit/*` | Create | metering idempotency, confirm transitions, env-trap, redirect-target, confirmed-only must-BLOCK |

`nav-items.tsx` is **unchanged** — product decision keeps Patients visible to all authenticated users.

## Interfaces / Contracts

```ts
// upload response (was { ok: true })
{ ok: true; labReportId: string }
// extract response (existing) drives the redirect target
{ ok: true; pendingReview: number; mapped: number; unmapped: number }
// confirm request — one entry per PENDING_REVIEW row
{ labReportId: string; results: Array<
  | { labResultId: string; action: 'confirm' }
  | { labResultId: string; action: 'correct'; value: string; unit?: string; refLow?: string; refHigh?: string }
  | { labResultId: string; action: 'manual'; biomarkerKey: string; value: string; unit?: string }> }
```

## Safety, Tenancy, Audit, Guardrails (config rule)

- **Tenancy**: every read/write in upload/extract/confirm/review binds `ownerId` from `auth()` and ignores client ownership; `prismaFor` is BYPASSRLS so `where:{ownerId}` is the only gate (AGENTS §6). The new confirm route + review page are new patient-data surfaces → MUST filter `ownerId` on every query.
- **Audit**: upload, extraction, retry (FAILED-run trail), and correction/manual/confirm each write an `AuditLog` row (confirm: `action:'update'`, `entity:'lab_results'`, `detail:{reviewStatus:'CONFIRMED', rows:N}`). Errors/logs never disclose PHI or storage paths.
- **Guardrails / consumer**: no `packages/guardrails` change; canonical fail-closed path reused for reports. The new review surface renders the mandatory non-dismissible disclaimer; medication overlays stay timing-only (none introduced in this flow). RAG/dosing boundaries unchanged — dosing remains authenticated-user-accessible, RAG enhancements remain license-verified-clinician-only.
- **Confirmed-only invariant**: analysis/analytics/reports already filter `reviewStatus:'CONFIRMED'`; a content-independent must-BLOCK test asserts PENDING_REVIEW never appears in those payloads (parity with the existing medication-dose test).

## Data Model

**No new table or field required.** Attempt identity = `labReportId`; confirmation audit via existing `AuditLog.detail`; metering idempotency via the atomic status claim. → **No Prisma migration, no new RLS policy** (AGENTS §6 satisfied — nothing new is added to patient-data tables). Optional `LabResult.confirmedAt`/`confirmedBy` deferred (Open Question).

## Testing Strategy (Strict TDD / Vitest)

| Layer | What | How |
|---|---|---|
| Unit | metering idempotency (atomic claim; sequential retry + concurrent → one usage record; FAILED retry unblocked); confirm transitions (confirm/correct/manual; ownerId binding; audit row written); env-trap (`\|\|` returns default on `""`, startup warn fires); redirect-target (`pendingReview>0`→review else analysis); confirmed-only must-BLOCK (PENDING_REVIEW absent from analysis/analytics/report payloads) | mock `QuotaDb` + route, Vitest |
| Integration | extract returns 402 on exhausted FREE new attempt; atomic rollback leaves no partial LabResults on persistence failure; confirm tenant isolation (cross-owner confirm → 404/403, no write) | Vitest route tests (extends `extract-route.test.ts`) |
| E2E (manual) | upload → auto-extract → review → analysis happy path; 402 upgrade dialog; retry after failure | Playwright — requires live server/DB/auth, not headless-CI |

## Threat Matrix

N/A — no new shell, subprocess (pdftoppm is pre-existing and untouched), VCS/PR automation, executable-file classification, or process-integration boundary. The new HTTP routes + locale redirects are covered by the tenancy/audit/guardrail section above.

## Migration / Rollout

No migration. Rollback: revert `plans.ts` FREE→0, disable the auto-chain in `upload-zone` (retain the manual Extract button), and hide the review route — while retaining statuses, audit, the FREE allowance, guardrails, disclaimer, tenancy, and PHI protections. Confirmation is never bypassed for pending values.

## Open Questions

- [ ] Add `LabResult.confirmedAt`/`confirmedBy` for richer confirmation audit, or keep `AuditLog`-only? (deferred — no migration needed for v1)
- [ ] True-concurrency duplicate vision call (two requests for the same UPLOADED report): accept as rare/single-user, or add a Postgres advisory lock? Atomic claim already prevents double metering + duplicate LabResults.
