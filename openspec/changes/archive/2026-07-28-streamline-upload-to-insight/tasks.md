# Tasks: Streamline Upload to Insight

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~1100–1200 (≈570 prod, ≈560 tests) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | 2 slices: S1 pipeline/metering/error-surfacing → S2 confirmation UI |
| Delivery strategy | auto-chain |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

> CRITICAL metering rule (obs #134, matches design.md): gate+meter ONLY on new attempts (`status==='UPLOADED'`); FAILED→EXTRACTING retries BYPASS BOTH quota gate AND metering. The atomic `updateMany where status='UPLOADED'` claim makes sequential retry free and concurrency-safe (one usage record). Honor exactly in 1.3.

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test | Runtime harness | Rollback boundary |
|------|------|-----------|--------------|-----------------|-------------------|
| S1 | Auto-extract→analysis/402/retry, idempotent metering, FREE=1, env-trap | PR1 (base main) | `pnpm test` (extract/upload/redirect/env/upload-zone) | Playwright upload→auto-extract→analysis (live server/DB/auth, manual; not headless CI) | revert extract/upload-zone/labs-list/plans/openai/upload-route; restore manual Extract button |
| S2 | PENDING_REVIEW confirm/correct/manual + confirmed-only invariant | PR2 (base PR1) | `pnpm test` (confirm/tenant/must-block) | Playwright upload→review→confirm→analysis (live, manual) | delete review page + confirm route; S1 stands alone |

## Phase 1: Foundation — metering, quota, env (Slice 1)

- [x] 1.1 RED `tests/unit/plans.test.ts`: `FREE.uploadsPerMonth===1`; GREEN `src/lib/plans.ts` change `0→1`
- [x] 1.2 RED `tests/unit/openai-env-trap.test.ts`: `||` returns default on empty string; `warnIfConfigIncomplete()` fires at startup; GREEN `packages/ai/src/openai.ts` lines 42/51 `??`→`||` + add warn
- [x] 1.3 RED extend `tests/unit/extract-route.test.ts`: new attempt (UPLOADED) gated+metered once; sequential retry (FAILED→EXTRACTING) bypasses gate AND meter; concurrent claims → one usage record; persistence failure → no partial LabResults + retry available; GREEN `labs/extract/route.ts`: `if(status==='UPLOADED'){checkQuota('UPLOAD')→402; atomic claim `updateMany where status='UPLOADED'`→recordUsage once}`; remove `finally` metering; keep `$tx` delete+create + FAILED-run trail

## Phase 2: Upload response + auto-extract orchestration (Slice 1)

- [x] 2.1 RED `tests/unit/upload-route.test.ts`: response `{ok:true,labReportId}`; GREEN `labs/upload/route.ts` return `labReportId` (ownerId/audit unchanged)
- [x] 2.2 RED `tests/unit/upload-zone.test.tsx`: auto-POST extract after upload ok; spinner+EXTRACTING badge; 402→`QuotaExceededDialog`; non-402→inline retry+manual-entry; locale-prefixed redirect (`pendingReview>0`→review else analysis); pre-upload "uses 1 credit" copy; GREEN `components/dashboard/upload-zone.tsx`
- [x] 2.3 RED `tests/unit/labs-list.test.tsx`: structured 402/error surfacing + `router.refresh()` (no silent swallow / `window.location.reload()`); GREEN `components/dashboard/labs-list.tsx`

## Phase 3: Confirmation surface (Slice 2 — base: PR1)

- [x] 3.1 RED `tests/unit/confirm-route.test.ts`: confirm/correct/manual flip PENDING_REVIEW→CONFIRMED in `$tx`; writes AuditLog (`action:'update'`,`entity:'lab_results'`,`rows:N`); ownerId-bound (cross-owner→404, no write); corrected value/biomarker stored; GREEN `labs/confirm/route.ts`
- [x] 3.2 RED `tests/unit/review-page.test.tsx`: owner-scoped PENDING_REVIEW list shows biomarker/value/unit/uncertainty reason; actions confirm/correct/manual; non-dismissible disclaimer renders; GREEN `labs/review/[labReportId]/page.tsx` (+`<ReviewForm>`)

## Phase 4: Cross-cutting safety & integration (Slice 2)

- [x] 4.1 RED extend `tests/unit/analytics-series.test.ts`: PENDING_REVIEW never appears in analysis/analytics/report payloads (content-independent must-BLOCK, parity w/ medication-dose test)
- [x] 4.2 RED `tests/unit/confirm-tenant-isolation.test.ts`: cross-owner confirm + cross-owner review read → 404/403, no write/read
- [x] 4.3 Document (not headless CI): Playwright upload→auto-extract→review→confirm→analysis; 402 dialog; retry-after-failure (live server/DB/auth required)

## Phase 5: Verify & harden

- [x] 5.1 `pnpm test` green; `pnpm lint`; `pnpm typecheck`; `pnpm build`
- [x] 5.2 Audit-log coverage on upload/extract/retry/confirm + PHI/error-safe messages; comment parity
