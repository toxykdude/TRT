# Exploration: streamline-upload-to-insight

> Read-only investigation. Maps the authenticated customer journey from lab
> upload to first insight, inventories friction/dead-ends, and root-causes the
> reported "Extract button failure". No application code was modified.

**Project:** trt (`/root/trt/TRT`)
**Date:** 2026-07-28
**Safety frame:** GOLD.md §2 — consumer dosing recommendations are generated for
every authenticated user; diagnostic prose is forbidden; disclaimers + canonical
guardrails are mandatory; every patient-data read/write binds `ownerId`.

---

## 1. Current State — the real pipeline

### 1.1 Authenticated customer sequence (as built today)

```
Login
  └─► /dashboard (Overview)            stat tiles + "View Analysis" CTA + recent-values table
       │                                  (recent-values table reads reviewStatus='CONFIRMED' only)
       │
       ├─[sidebar: 10 items]───────────────────────────────────────────────────────┐
       │   Overview · Analysis · Patients · Labs · Reports · Medications ·          │
       │   Symptoms · Timeline · Analytics · Settings                              │
       │                                                                           │
       ▼                                                                           │
  /dashboard/labs   ── UploadZone (drag/drop, multi-file: PDF/JPG/PNG/HEIC)        │
       │                                                                           │
       │  POST /dashboard/labs/upload       (FormData)                              │
       │   → file saved OUTSIDE webroot (/var/lib/trt/uploads/<userId>/<uuid>)      │
       │   → LabReport.create(status='UPLOADED')   ← NO quota gate, NO auto-extract │
       │                                                                           │
       │  *** MANUAL STEP: user must click "Extract" on EACH row ***                │
       │                                                                           │
       ▼                                                                           │
  LabsList.extract(id)                                                              │
       │  POST /dashboard/labs/extract   { labReportId }                            │
       │   → checkQuota('UPLOAD')  ── FREE tier = 0 uploads → 402                   │
       │   → extractLabWithRun() → renderPages (pdftoppm) → vision model            │
       │     → ExtractionSchema validate → $transaction(persist LabResults)         │
       │   → each row: reviewStatus = CONFIRMED (conf≥thr + mapped)                 │
       │                or PENDING_REVIEW (low-conf OR unmapped)                    │
       │                                                                           │
       │  catch → console.error ONLY; client swallows error; window.location.reload│
       │                                                                           │
       ▼                                                                           │
  LabReport.status = EXTRACTED | REVIEW_NEEDED | FAILED                             │
                                                                                    │
  /dashboard/labs/results   (READ-ONLY display of ALL rows, grouped by marker)      │
       └─ PENDING_REVIEW rows show a "review" badge — but NO confirm button exists  │
                                                                                    │
  /dashboard/reports                                                              ◄─┘
       │  GenerateReportButton (disabled if resultCount===0)
       │  POST /dashboard/reports/generate
       │   → reads ONLY reviewStatus='CONFIRMED' rows
       │   → deterministic engine analyze() + KB + graph enrich
       │   → generateDosingRecommendations()  (ALL users — GOLD §2.3)
       │   → decideReportPolicy (clinician gating for RAG badges)
       │   → Report.create() + guardrail audit
       │
       ▼
  /dashboard/reports/[id]   ← FIRST REAL INSIGHT (dosing, trends, red flags)
  /dashboard/analysis       ← charts/red-flags from CONFIRMED results + latest report
```

### 1.2 Time-to-insight

Minimum **4–5 explicit user actions across 3 distinct pages** before any insight:
upload → (find + click) Extract → navigate to Reports → Generate → open report.
There is **no automatic extraction after upload** and **no post-extract redirect**
to analysis/report. The user must know to walk the sidebar themselves.

---

## 2. The reported "Extract button failure" — root-cause assessment

### 2.1 The Cloudflare beacon is NOT causal (definitive)

**Evidence:** `grep` for `cloudflareinsights|beacon` across `apps/web/src` returns
**zero application references** — the only `beacon` hits are unrelated SVG brand
logo assets under `public/brand/`. The script
`static.cloudflareinsights.com/beacon.min.js` is **Cloudflare Web Analytics**,
injected by the Cloudflare Tunnel/CDN layer (not by application code).
`ERR_BLOCKED_BY_CLIENT` means the user's **ad-blocker or privacy browser**
(uBlock Origin, Brave Shields, AdGuard) blocked a passive analytics script.

The extraction pipeline is an entirely **server-side** `fetch('/dashboard/labs/extract')`
Round-trip that has no dependency on any client-side analytics script. The two are
fully independent. **The console message is a red herring.**

### 2.2 The ACTUAL likely failure paths (ranked by probability)

| # | Cause | Where | Likelihood | Evidence |
|---|-------|-------|-----------|----------|
| **1** | **Silent client-side error swallowing** — `LabsList.extract()` catches every error and renders NOTHING, then reloads. User sees spinner→reload→status unchanged→Extract button reappears. Feels "broken" for ANY non-200 (402, 500, 404). | `apps/web/src/components/dashboard/labs-list.tsx:42-48` | **HIGH** | `catch { // surfaced by the next list refresh }` — no toast, no banner, no inline error. Contrast `generate-report-button.tsx` which properly handles 402 via `QuotaExceededDialog`. |
| **2** | **FREE-tier quota wall (0 uploads)** — `checkQuota('UPLOAD')` returns `allowed:false` → 402. Upload itself is NOT gated, so the file uploads fine, then Extract 402s. Very confusing. | `extract/route.ts:34-39`; `plans.ts:41` (`FREE.uploadsPerMonth: 0`) | **HIGH** | Free users can upload but cannot extract — the gate is at extract, not upload. Combined with #1, this is invisible. |
| **3** | **`OPENAI_API_URL`/`OPENAI_MODEL` empty-string trap** — env read with `??` (nullish), not `\|\|`. If CI renders an empty secret, `"" ?? DEFAULT` = `""` → empty base URL / empty model → vision call fails → 500. | `packages/ai/src/openai.ts:42,51`; flagged in `FOLLOWUP.md` §7 | **MEDIUM** | Explicitly documented as a known trap. AGENTS.md says prod was verified working 2026-07-24, so this most likely bites DEV or after a secret rotation. |
| **4** | **`pdftoppm` missing / render failure** — `renderPages()` shells out to poppler; a missing binary or pathological PDF throws → 500. | `packages/ai/src/pdf-render.ts:75-99` | LOW-MED | `finally` always reloads regardless; `errorClass` recorded in ExtractionRun. |
| **5** | **`ExtractionSchemaError`** — model returns JSON that fails the zod gate → 500 with a specific message (but message is also swallowed by #1). | `extract/route.ts:200-202` | LOW | Generic message returned; never leaks to client. |

### 2.3 Recommended diagnostic action (cheap, non-code)

1. Check `ExtractionRun` rows for the failing user's `labReportId` — `outcome`,
   `errorClass`, `modelId` tell exactly which branch fired (FAILED rows are always
   written, even on rollback). This is the single source of truth for "why did it fail".
2. Confirm the user's effective plan (`getEffectivePlanCode`) — if FREE, cause #2 is confirmed.
3. Check `/opt/trt/apps/web/.env.local` for empty `OPENAI_API_URL`/`OPENAI_MODEL` — cause #3.

---

## 3. Friction inventory & dead ends

| # | Issue | Location | Impact |
|---|-------|----------|--------|
| F1 | **No auto-extract after upload.** Upload creates `UPLOADED`; user must manually find + click Extract per row. | `upload/route.ts`, `upload-zone.tsx`, `labs-list.tsx` | Adds a hidden step; many users will never extract. |
| F2 | **Silent extract errors.** `LabsList.extract()` swallows 402/500/404; only a console.error server-side. No user feedback at all. | `labs-list.tsx:42` | The reported "Extract button does nothing" — regardless of root cause. |
| F3 | **PENDING_REVIEW is a dead end.** Low-confidence/unmapped biomarkers are set `PENDING_REVIEW` and **never feed** dashboard/analysis/reports/analytics (all read `CONFIRMED`). **There is NO confirm/review route or UI anywhere** to transition them to CONFIRMED. They are permanently stuck. | `extract/route.ts:122`; grep finds zero write of `reviewStatus='CONFIRMED'` outside the default. `labs/results/page.tsx` is read-only. | Data extracted but unusable; user sees "Review needed" with no action available. |
| F4 | **Upload gated AFTER upload, at extract.** FREE = 0 uploads, but the file uploads successfully → then Extract 402s. Inconsistent gating + invisible error (F2). | `upload/route.ts` (no quota), `extract/route.ts:34` (quota) | Wasted user effort; confusing. |
| F5 | **Long manual chain to first insight.** Upload → Extract → Reports → Generate → open report = 4-5 actions / 3 pages. No guided flow, no post-extract redirect. | sidebar IA + page links | High time-to-insight; abandon risk. |
| F6 | **"Patients" nav item for a patient user.** Sidebar shows a future clinician feature (`/dashboard/patients`) to every authenticated user. | `nav-items.tsx:18` | Confusing IA; dead-end page for patients. |
| F7 | **`window.location.reload()` after extract.** Full page reload instead of optimistic/router update — slow, loses scroll position, feels janky. | `labs-list.tsx:47` | Poor UX, amplifies F2 (reload hides the error). |
| F8 | **Manual entry is the working escape hatch but undiscoverable.** Manual route creates CONFIRMED rows directly (schema default), bypassing the review trap — but it's a small `<ManualEntry>` affordance buried under the upload zone. | `manual/route.ts`; `labs/page.tsx:47` | Power users can self-serve, but most won't find it. |
| F9 | **`numOrNull` duplicated 4×** across generate route, results page, extraction — divergence risk. | TODO comment in `reports/generate/route.ts:267` | Maintenance debt. |

---

## 4. Affected Areas (files / symbols)

- `apps/web/src/components/dashboard/upload-zone.tsx` — `UploadZone`, `uploadAll` (no auto-extract, post-upload only refreshes list).
- `apps/web/src/components/dashboard/labs-list.tsx` — `LabsList`, `extract` (silent error swallow F2; full reload F7).
- `apps/web/src/app/[locale]/dashboard/labs/upload/route.ts` — `POST` (no quota gate F4; status UPLOADED only).
- `apps/web/src/app/[locale]/dashboard/labs/extract/route.ts` — `POST` (quota gate; PENDING_REVIEW writes F3; error generic message).
- `apps/web/src/app/[locale]/dashboard/labs/manual/route.ts` — `POST` (the working CONFIRMED-by-default escape hatch F8).
- `apps/web/src/app/[locale]/dashboard/labs/results/page.tsx` — read-only; no confirm action (F3).
- `apps/web/src/app/[locale]/dashboard/reports/generate/route.ts` — reads CONFIRMED only; dosing for all users.
- `apps/web/src/app/[locale]/dashboard/analysis/page.tsx` — reads CONFIRMED only; trends/charts.
- `apps/web/src/app/[locale]/dashboard/page.tsx` — overview; "View Analysis" CTA but no guided upload-first flow.
- `apps/web/src/components/dashboard/nav-items.tsx` — `NAV` (10 items incl. "patients" F6).
- `apps/web/src/components/dashboard/generate-report-button.tsx` — reference for correct 402 handling (contrast F2).
- `packages/ai/src/extraction.ts` — `extractLabWithRun`, `extractLabLive`, `ExtractionSchemaError`.
- `packages/ai/src/pdf-render.ts` — `renderPages` (pdftoppm dependency #4).
- `packages/ai/src/openai.ts` — `openaiClient`, `extractionModelId` (`??` trap #3).
- `apps/web/src/lib/quota.ts` — `checkQuota`, `recordUsage`.
- `apps/web/src/lib/plans.ts` — `PLANS.FREE.uploadsPerMonth: 0`.
- `packages/db/prisma/schema.prisma` — `LabResult.reviewStatus @default(CONFIRMED)`.

---

## 5. Approaches

### Approach A — "Guided auto-extract flow" (recommended)

Auto-trigger extraction on successful upload, surface errors inline (parity with
GenerateReportButton), and collapse the upload→extract→report journey into a
single guided path. Keep manual confirm out of v1 but auto-confirm high-confidence
rows (already the case) and make low-confidence a soft warning, not a hard gate.

- **Pros:** Shortest time-to-insight; fixes F1/F2/F5 directly; no safety regression
  (dosing stays consumer-allowed, disclaimers intact, `ownerId` binding untouched);
  smallest surface change.
- **Cons:** Auto-extract consumes a paid vision call per upload (quota already meters
  attempts at extract, so this is unchanged cost-wise, but failures now happen
  immediately and must be surfaced well). Needs the inline error UI from F2 fix.
- **Effort:** Medium.

### Approach B — "Fix the review dead-end + error surfacing only"

Add a confirm/review route + UI so PENDING_REVIEW rows can be promoted to CONFIRMED,
and fix `labs-list.tsx` to show errors. Do NOT change the step count.

- **Pros:** Completes the extraction data model (F3); makes failures visible (F2);
  low risk; preserves every existing screen.
- **Cons:** Does NOT shorten time-to-insight (F5 remains); adds a new review step
  (could lengthen it); patients confirming their own lab values has a clinical-safety
  nuance worth a product decision.
- **Effort:** Medium.

### Approach C — "Sidebar IA cleanup + dashboard restructure"

Reorder/cull nav (remove/hide "Patients" for non-clinicians F6), make the Overview
page the guided entry point (empty-state → upload → extract → insight), and
de-duplicate `numOrNull` (F9).

- **Pros:** Improves orientation; complements A or B.
- **Cons:** Pure-UX; does not fix the pipeline dead-ends (F2/F3) on its own.
- **Effort:** Low-Medium.

**Recommendation:** **A + C**, with B's confirm-route deferred unless product wants
patient self-confirmation. Specifically: (1) auto-extract on upload, (2) inline error
+ 402 dialog parity in `labs-list.tsx`, (3) post-extract redirect to Analysis when
CONFIRMED results exist, (4) hide "Patients" for non-clinicians, (5) fix the
`OPENAI_*` `??`→`||` trap. Defer the PENDING_REVIEW confirm UI to a separate decision.

---

## 6. Recommended target workflow (post-streamline)

```
Login → /dashboard
  └ empty state: single "Upload your lab" CTA
       └ UploadZone → POST upload → AUTO-extract (server action chain)
            ├ 402 → QuotaExceededDialog (upgrade)            [parity with report flow]
            ├ 500 → inline retry + "enter manually" fallback [visible error]
            └ success:
                 ├ all CONFIRMED → redirect /dashboard/analysis (immediate insight)
                 └ some PENDING  → /dashboard/analysis + a soft "N values need review" banner
  └ has data: Overview shows trends + latest dosing summary + link to full report
```

Time-to-insight drops from ~5 actions/3 pages to **1 action (upload) → auto-insight**.

---

## 7. Risks

- **Auto-extract burns paid calls on every upload** — mitigated: quota already meters
  at extract (RISK-01); FREE users hit the 402 wall immediately (now visibly, via F2 fix).
- **Patient self-confirmation of PENDING_REVIEW values** (Approach B) — clinical-safety
  question: should a patient promote a low-confidence AI value to CONFIRMED, or must
  that be manual entry only? Needs a product/clinical decision before building.
- **Removing the manual Extract step** changes the quota-metering UX — users no longer
  "opt in" to a paid call; the upload itself becomes the billable event. Must be
  communicated (e.g. "uploading will use 1 of N extraction credits").
- **Post-extract redirect** must respect locale prefix (`/[locale]/dashboard/...`) and
  not leak whether other tenants have data.
- **`OPENAI_*` fix** (`??`→`||`) is a one-line change but could mask a genuinely
  misconfigured secret; pair with a startup log warning when empty.

---

## 8. Unresolved product decisions (for the user)

1. **Should extraction auto-fire on upload**, or remain an explicit user action?
   (Recommendation: auto-fire, with visible quota/error feedback.)
2. **Should patients be able to confirm PENDING_REVIEW values**, or must low-confidence/
   unmapped values always be re-entered manually? (Clinical-safety call.)
3. **Is the "Patients" nav item** intended for patient users, or clinician-only? (Hide
   for non-clinicians today?)
4. **Should the FREE tier allow at least 1 extraction** so the core loop is demoable
   without payment? (Currently 0 uploads = full paywall on the primary value.)

---

## 9. Ready for Proposal?

**Yes** — with the four product decisions above resolved first. The friction inventory,
root-cause assessment, and target workflow are clear enough to write a proposal +
spec. The two highest-value, lowest-risk changes (fix silent extract errors F2; fix
`OPENAI_*` trap #3) can proceed immediately regardless of the larger flow decision.
