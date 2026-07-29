# Apply Progress — streamline-upload-to-insight (Slices S1 + S2, MERGED)

**Branches:** `feat/streamline-upload-to-insight-s1` (PR1, base main) → `feat/streamline-upload-to-insight-s2` (PR2, base PR1).
**Mode:** Strict TDD (Vitest) — RED → GREEN per task, with triangulation.
**Delivery:** auto-chain / stacked-to-main. S1 = PR1, S2 = PR2. Neither pushed.
**S2 commits:** `6efa429` (Phase 3), `b811c1f` (Phase 4), `6f520d1` (hardening).

## Completed Tasks (cumulative — S1 + S2)

### Phase 1: Foundation — metering, quota, env (Slice 1)
- [x] **1.1** FREE.uploadsPerMonth 0→1. GREEN: `src/lib/plans.ts`.
- [x] **1.2** OpenAI env trap (`??`→`||` + `warnIfConfigIncomplete()`). GREEN: `packages/ai/src/openai.ts` + `apps/web/instrumentation.ts`.
- [x] **1.3** Idempotent metering rewrite (atomic `updateMany where status=UPLOADED` claim). GREEN: `labs/extract/route.ts`.

### Phase 2: Upload response + auto-extract orchestration (Slice 1)
- [x] **2.1** Upload returns `{ ok: true, labReportId }`. GREEN: `labs/upload/route.ts`.
- [x] **2.2** Auto-extract orchestration (`extract-flow.ts` pure helpers + `upload-zone.tsx`). 
- [x] **2.3** Structured error surfacing (`labs-list.tsx`).

### Phase 3: Confirmation surface (Slice 2)
- [x] **3.1** Confirm route. `tests/unit/confirm-route.test.ts` (new, 9 tests):
  confirm/correct/manual flip PENDING_REVIEW→CONFIRMED in one `$transaction`; AuditLog
  (`action:'update'`, `entity:'lab_results'`, `detail:{reviewStatus:'CONFIRMED', rows:N}`);
  ownerId-bound (cross-owner labReport → 404 no write; cross-owner labResult → not flipped);
  corrected value/unit/range + resolved biomarker stored; 401/400 guards. GREEN:
  `labs/confirm/route.ts` (atomic `updateMany where reviewStatus='PENDING_REVIEW'` transition
  guard; per-entry `buildConfirmData`; audit per attempt).
- [x] **3.2** Review page + `<ReviewForm>`. `tests/unit/review-flow.test.ts` (new, 6 tests):
  unmapped vs low-confidence reason; per-lab refText; missing-value `—`. GREEN:
  `src/lib/review-flow.ts` (pure `toReviewRow`/`buildReviewRows`), `labs/review/[labReportId]/page.tsx`
  (Server Component, owner-scoped, NON-DISMISSIBLE `<SafetyBanner>` disclaimer), `review-form.tsx`
  (confirm/correct/manual client actions → POST confirm → locale-prefixed `/analysis`). en+es
  `Dashboard.Review` i18n keys. (Component wiring verified by typecheck + manual Playwright —
  vitest has no jsdom, same layer decision as S1.)

### Phase 4: Cross-cutting safety & integration (Slice 2)
- [x] **4.1** Confirmed-only must-BLOCK. Extended `tests/unit/analytics-series.test.ts` (+2 tests):
  content-independent PENDING_REVIEW must-BLOCK, parity w/ the medication-dose field test. RED
  forced a genuine GREEN — added a defense-in-depth post-query `reviewStatus:'CONFIRMED'` filter
  in `buildAnalyticsSeries` so a bypassed/changed WHERE can NEVER surface pending data (mirrors
  the medication two-layer model: by-construction select + assertConsumerSafe throw).
- [x] **4.2** Tenant-isolation threat matrix. `tests/unit/confirm-tenant-isolation.test.ts` (new,
  5 tests): cross-owner confirm → 404 no write; cross-owner labResult → count 0; cross-owner
  review READ → null + pending-list query NEVER issued. RED forced a GREEN refactor: extracted
  the page's owner-scoped fetch into `src/lib/review-data.ts` `loadReviewData(db, id, owner)` —
  the testable tenancy seam (Extract-Before-Mock); the page now calls it.
- [x] **4.3** Manual Playwright harness documented in `playwright-harness.md` (5 scenarios: full
  confirm flow, cross-owner blocking, 402 dialog, retry-after-failure, confirmed-only runtime).

### Phase 5: Verify & harden
- [x] **5.1** `pnpm test` 232/232; `pnpm -r lint` clean; `pnpm -r typecheck` 7/7 Done; `pnpm build` clean (all routes incl. `/labs/confirm`, `/labs/review/[labReportId]` compiled).
- [x] **5.2** Audit coverage on upload/extract/retry(FAILED trail)/confirm + PHI-free error
  messages; comment parity across the four routes.

### Verify-report hardening (accepted S-1 + S-2)
- [x] **S-1** `recordUsage(...).catch(()=>undefined)` (extract/route.ts:72) now logs a PHI-free
  `usage_record_failed` marker server-side (best-effort metering stays best-effort, now
  observable). Test: `extract-route-hardening.test.ts` (rejects → log fires + 200).
- [x] **S-2** retry-path `labReport.update({where:{id}})` (extract/route.ts:78) →
  `updateMany({where:{id,ownerId}})` for defense-in-depth parity with the atomic claim. Test:
  `extract-route-hardening.test.ts` (retry flip WHERE includes ownerId); extract-route.test.ts
  retry approval assertion updated.

## TDD Cycle Evidence (S2)

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 3.1 | `tests/unit/confirm-route.test.ts` | Unit (route) | N/A (new) | ✅ 9 fail | ✅ 9 pass | ✅ confirm/correct/manual + 401/400 + cross-owner labReport/labResult + audit-on-zero | ✅ extracted `buildConfirmData` + `numOrNull` |
| 3.2 | `tests/unit/review-flow.test.ts` | Unit (pure) | N/A (new) | ✅ import fail | ✅ 6 pass | ✅ unmapped vs low-conf + verbatim refText + missing-value | ✅ extracted `formatRefText` |
| 4.1 | `tests/unit/analytics-series.test.ts` | Unit (pure) | 14/14 | ✅ 2 fail | ✅ 16 pass | ✅ pending+confirmed seed + pending-only seed | ✅ defense-in-depth filter |
| 4.2 | `tests/unit/confirm-tenant-isolation.test.ts` | Unit (route+seam) | N/A (new) | ✅ import fail | ✅ 5 pass | ✅ cross-owner write + cross-owner read + valid-owner | ✅ extracted `loadReviewData` seam |
| S-1/S-2 | `tests/unit/extract-route-hardening.test.ts` | Unit (route) | 10/10 | ✅ 2 fail | ✅ 3 pass | ✅ metering log + PHI-free + retry ownerId | ➖ approval assertion updated |

## Work Unit Evidence (S2)

| Unit | Focused test (command → result) | Runtime harness | Rollback boundary |
|------|---------------------------------|-----------------|-------------------|
| 3.1 | `vitest run tests/unit/confirm-route.test.ts` → 9/9 pass | Playwright confirm→analysis (live — manual, 4.3 S2-1) | delete `labs/confirm/route.ts`; S1 stands |
| 3.2 | `vitest run tests/unit/review-flow.test.ts` → 6/6 pass | Playwright review page render + disclaimer (live — manual, 4.3 S2-1) | delete review page + `review-form.tsx` + `review-flow.ts`; confirm route stands |
| 4.1 | `vitest run tests/unit/analytics-series.test.ts` → 16/16 pass | Playwright confirmed-only runtime (live — manual, 4.3 S2-1P) | revert `analytics-series.ts` defense-in-depth filter |
| 4.2 | `vitest run tests/unit/confirm-tenant-isolation.test.ts` → 5/5 pass | Playwright cross-owner (live — manual, 4.3 S2-2) | revert page to inline fetch + delete `review-data.ts` |
| S-1/S-2 | `vitest run tests/unit/extract-route-hardening.test.ts` → 3/3 pass | Playwright retry-after-failure (live — manual, 4.3 S2-4) | revert extract/route.ts lines 72 + 78 |

## Test Summary (S2)
- Total tests authored this slice: **+25** (confirm-route 9, review-flow 6, analytics-series +2, confirm-tenant-isolation 5, extract-route-hardening 3).
- Total passing: **@trt/web 232/232** (was 207 in S1).
- Layers: Unit (25). Pure functions created: `toReviewRow`, `buildReviewRows`, `formatRefText`, `loadReviewData`, `buildConfirmData`, `numOrNull` (confirm-local).
- Approval-test updates (behavior change): `extract-route.test.ts` retry assertion (S-2: `update`→`updateMany` + ownerId).

## Sizing / Budget — OVERAGE (flag for the gate)
- S2 footprint vs S1 branch: **1560 insertions + 8 deletions = 1568 changed lines** across 15
  files (3 commits). This EXCEEDS the tasks.md S2 forecast (~150–400) AND the 800-line session
  review budget. ~679 prod + ~872 test + ~42 i18n. Driven by Strict-TDD triangulation across the
  tenancy + confirmed-only + audit + hardening threat matrix. **Recommendation:** S2 commits are
  structured as independent work units and CAN split into stacked sub-PRs: PR2a = Phase 3
  (`6efa429`, ~640 lines), PR2b = Phase 4 + hardening (`b811c1f` + `6f520d1`, ~928 lines) — or
  accept `size:exception` since the slice is a single cohesive deliverable (the confirm flow).

## Deviations from tasks.md (S2)
1. **Test files are `.test.ts`, not `.tsx`** (3.2 said `review-page.test.tsx`). Same runner-glob
   constraint as S1 (`include: ['tests/unit/**/*.test.ts']` + `environment:'node'`, no jsdom). The
   review-row shaping was extracted into pure helpers (`review-flow.ts`) + a server seam
   (`review-data.ts`) and unit-tested; component wiring verified by typecheck + the manual
   Playwright harness (4.3).
2. **4.1 added a production change, not just a test.** The "content-independent must-BLOCK" RED
   test failed against existing code (the mock returns PENDING rows and `buildMarkerViews`
   processed them), so GREEN added a genuine defense-in-depth post-query CONFIRMED filter in
   `buildAnalyticsSeries`. This strengthens the invariant from query-only to two-layer (parity
   with the medication model) — a real improvement, noted here.
3. **4.2 extracted `loadReviewData`** from the page (Extract-Before-Mock) so the cross-owner
   "no read" invariant is unit-testable without rendering the Server Component.

## Issues Found
- None blocking S2. The `@trt/db typecheck` RED and `.next/types` billing artifacts are
  pre-existing (AGENTS §1.5) and did NOT reproduce in this environment (`pnpm -r typecheck` exit 0).

## Safety Invariants Verified
- Every patient-data read/write binds ownerId from auth; cross-owner → 404/null with no write/read (4.2 threat matrix).
- Unconfirmed values NEVER influence analytics — the 4.1 must-BLOCK proves it content-independently (two-layer: query filter + post-query guard).
- Non-dismissible disclaimer renders on the review surface (`<SafetyBanner>` — no close affordance).
- PHI-free client errors on every new surface (generic 401/400/404/errFailed copy; `usage_record_failed` logs error class only).
- i18n: en+es `Dashboard.Review` keys for all new UI copy.
- No new patient-data table/field → no Prisma migration / new RLS policy (AuditLog-only, per design).

## Remaining
All 13 tasks (1.1–5.2) complete. Next: re-verify the full change (S1+S2) via sdd-verify, then archive. W-1 (manual Playwright runtime DOM evidence) should run against live DEV before prod.
