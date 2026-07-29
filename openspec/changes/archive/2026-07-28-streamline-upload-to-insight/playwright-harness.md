# Manual Playwright Harness — streamline-upload-to-insight

> These scenarios require a **live server + Postgres + auth** and therefore run
> **manually**, not in headless CI (this repo's vitest is `environment:'node'`
> with no jsdom; Playwright specs in `tests/*.spec.ts` run via
> `pnpm exec playwright test` against a running app). They are the runtime DOM
> evidence for the S1 + S2 logic proven by unit tests.

## Prerequisites

- DEV stack up: pm2 `trt-dev` on `:3001`, Postgres `trt_dev` (synthetic seed only).
  Or local: `pnpm dev` + `pnpm --filter @trt/db prisma:migrate dev`.
- A test account with a FREE plan (to exercise the 402 path) and a second seeded
  account with results to exercise the happy path.
- Real or stub extraction: stub mode (no `OPENAI_API_KEY`) returns high-confidence
  values → `pendingReview=0` → `/analysis`. To exercise the REVIEW path, seed a
  LabReport with `status:'REVIEW_NEEDED'` + LabResults `reviewStatus:'PENDING_REVIEW'`
  directly in `trt_dev`, or run extraction live against a low-confidence fixture.

## Scenario S2-1: upload → auto-extract → review → confirm → analysis

The end-to-end confirmation flow (spec Reqs 1, 4, 5).

1. Sign in. Navigate to `/{locale}/dashboard/labs`.
2. Upload a lab file. Expect: the **EXTRACTING** spinner + badge show automatically
   (no manual Extract click). Pre-upload copy reads "uses 1 of your extraction
   credits".
3. With a review-required extraction, expect the locale-prefixed redirect to
   `/{locale}/dashboard/labs/review/{labReportId}`.
4. On the review page, expect: the **non-dismissible disclaimer** renders (no close
   button). Each PENDING_REVIEW row shows biomarker name, value, unit, reference
   range, and an uncertainty reason ("Unmapped biomarker" or "Low confidence").
5. For one row choose **Confirm**; for another choose **Correct**, edit the value,
   pick **Re-enter** for an unmapped one, enter a biomarker key + value.
6. Submit. Expect: a POST to `/dashboard/labs/confirm`, then a locale-prefixed
   redirect to `/{locale}/dashboard/analysis`.
7. On analysis, expect: only the CONFIRMED values appear in the trend charts; the
   corrected/re-entered values are reflected. The previously-pending biomarker
   that was confirmed now has a trend point.
8. Verify in DB: an `audit_logs` row (`action:'update'`, `entity:'lab_results'`,
   `detail:{reviewStatus:'CONFIRMED', rows:N}`) was written; the flipped
   `lab_results.reviewStatus` is now `CONFIRMED`.

## Scenario S2-2: cross-owner confirm/review is blocked (tenant isolation)

Spec Req 6 — `prismaFor` is BYPASSRLS; `where:{ownerId}` is the only gate.

1. Sign in as user A; note a `labReportId` owned by A.
2. In a second browser session as user B, attempt:
   - `POST /dashboard/labs/confirm { labReportId: <A's id>, results:[...] }`
     → expect **404** (no oracle leak, no write). Verify no `audit_logs` row and
     no `lab_results` change for A's report.
   - `GET /{locale}/dashboard/labs/review/{A's labReportId}` → expect **404**
     (notFound). Verify no pending-list query issued server-side (logs).
3. As user B inside B's own valid labReport, supply a `labResultId` belonging to A
   in a confirm body → expect 200 but `confirmed:0`; A's row is untouched.

## Scenario S2-3: 402 upgrade dialog (exhausted FREE allowance)

Spec Req 2 — a FREE account gets exactly one extraction; the 402 opens the
upgrade dialog.

1. As a FREE user with zero metered attempts, upload + auto-extract once →
   succeeds (`recordUsage` once).
2. Upload a SECOND new report + auto-extract → expect the **QuotaExceededDialog**
   to open (402) with the upgrade pointer. The report stays `UPLOADED` (no
   extraction ran, no second usage record).
3. Retry on the same second report after an admin bump (or in DEV via a forced
   `forceQuotaWall` search param on the report button for parity) — confirm the
   dialog also renders there.

## Scenario S2-4: retry after failure (no re-metering)

Spec Req 3 — a FAILED→EXTRACTING retry bypasses both gate and metering.

1. Force an extraction failure (e.g. point `OPENAI_API_URL` at an unreachable host,
   or upload a corrupt file in live mode) → expect inline retry + manual-entry
   actions (not a silent reload). The report is `FAILED`; an `extraction_runs`
   row with `outcome:'FAILED'` exists.
2. Click **Retry**. Expect: extraction re-runs, NO quota gate fires, NO second
   `usageRecord` is written (the atomic claim is skipped on FAILED→EXTRACTING).
3. On success, expect the normal review/analysis redirect.

## Scenario S2-1P: confirmed-only invariant (defense-in-depth)

Spec Req 4 "Leave value unconfirmed" + the 4.1 must-BLOCK.

1. Seed a LabReport with two LabResults: one `CONFIRMED`, one `PENDING_REVIEW`,
   for the same biomarker key with different values.
2. Open `/{locale}/dashboard/analytics`. Expect: only the CONFIRMED value appears
   in the trend; the pending value is absent regardless of its content.
3. Leave the pending value unconfirmed; generate a report → expect the pending
   value is excluded from the report payload too.
4. The unit tests in `tests/unit/analytics-series.test.ts` ("PENDING_REVIEW
   must-BLOCK") lock this invariant content-independently; this scenario is the
   runtime DOM confirmation.
