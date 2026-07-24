# TRT Insights — SaaS Engineering Roadmap

**Pairs with:** `company_implementation.md` (business plan). Every workstream below
exists to unblock a phase or TODO in that document.
**Repo:** Next.js 15 + TypeScript pnpm monorepo (`apps/web`, `packages/{ai,db,engine,kb,mcp}`),
Postgres + Prisma with RLS, Auth.js v5, deployed on a Debian LXC behind Cloudflare Tunnel (pm2).
**Process rule:** this repo runs **strict TDD** — every item below ships tests first.
Acceptance criteria are written to be directly translatable into failing tests.

**Effort key:** S ≈ ≤2 days, M ≈ 3–7 days, L ≈ 1.5–3 weeks (solo developer).

---

## Priority overview

| Priority | Workstream | Unblocks (company plan) |
|---|---|---|
| P0.1 | Compliance & product integrity | Phase 0 — absolute launch blocker |
| P0.2 | Real extraction pipeline | Phase 0/1 — core value prop |
| P1 | Billing (Stripe) | Phase 2 — paid launch |
| P1 | Transactional email | Phase 2 |
| P2 | Multi-tenancy for clinicians | Phase 3 |
| P2 | Admin backend | Phase 2 (partial) / Phase 3 (full) |
| P3 | Ops & security hardening | Phase 3/4 (BAA gate) |

---

## P0.1 — Compliance & Product Integrity

**Why.** The current build ships consumer-reachable exact-steroid-dosing output with
guardrails removed. As established in `company_implementation.md` §1, this blocks
payments (Stripe restricted-business terms), advertising (Meta/Google/TikTok health
policies), insurance (uninsurable), and creates DEA Schedule III facilitation
exposure. Nothing else on this roadmap matters until this lands. `CHANGES.md` already
flags that GOLD.md §2 contradicts surviving code and tests — the spec and the code
must be re-converged on the safe side.

### P0.1.a — Resolve the GOLD.md §2 contradiction (restore the safety spec)

- **What:** rewrite `GOLD.md` §2 ("The Prime Directive") to reinstate the safety
  posture: consumer output is education/trends/classification only; dosing/protocol
  content is clinician-gated; disclaimers are mandatory (§2.5 currently says
  "optional"); delete/replace §2.3 "Removed Restrictions."
- **How:**
  - [ ] Rewrite `GOLD.md` §2.1–§2.5 so the spec matches the target behavior below.
  - [ ] Update `CHANGES.md` with an entry recording the reversal and its rationale.
  - [ ] Sweep `AGENTS.md` and `master_prompt.md` for language that instructs agents to
        bypass or omit guardrails; align them with the restored spec.
- **Acceptance criteria:**
  - `GOLD.md` contains no instruction to remove, weaken, or make optional any safety
    guardrail or disclaimer.
  - `CHANGES.md` no longer flags a spec-vs-code contradiction (the follow-up items
    below make the code match).
- **Effort:** S

### P0.1.b — Reinstate guardrails as a single shared package

- **What:** one canonical guardrail implementation, deduplicating
  `packages/engine/src/guardrails.ts` and `packages/ai/src/guardrails.ts`, with regex
  coverage extended from the current T/hCG/AI subset to **every** entry in the
  `COMPOUNDS` array in `packages/ai/src/dosing.ts` (Testosterone, Nandrolone,
  Trenbolone, Boldenone, Masteron, Primobolan, Oxandrolone, Dianabol, Clenbuterol,
  Clomiphene, Tamoxifen, hCG, AIs).
- **How:**
  - [ ] Create `packages/guardrails` (new workspace package) exporting:
        `scanForDosing(text): GuardrailFinding[]`, `redactDosing(text, role)`,
        `assertConsumerSafe(reportPayload)`.
  - [ ] Tests first: port and extend `packages/engine/src/guardrails.test.ts` and
        `packages/ai/src/guardrails.test.ts` into the new package; add one test case
        per `COMPOUNDS` entry (brand names, ester variants, mg/week and mg/day dose
        patterns, IU patterns for hCG).
  - [ ] Replace both existing implementations with re-exports from
        `packages/guardrails`; delete the duplicated logic.
  - [ ] Wire `assertConsumerSafe` into the report assembly path in
        `packages/engine/src/report.ts` and `packages/ai/src/report.ts` so a
        consumer-role render that contains dosing content **fails closed** (throws),
        rather than silently rendering.
- **Acceptance criteria:**
  - Exactly one guardrail implementation exists in the workspace (grep-enforceable:
    no dosing-regex definitions outside `packages/guardrails`).
  - For each of the 13 compound families, a test proves a dosing sentence is detected
    and redacted for PATIENT role and passed through for verified CLINICIAN role.
  - A consumer report containing any dosing string cannot be generated (fails closed,
    covered by a test).
- **Effort:** M

### P0.1.c — Mandatory disclaimers

- **What:** disclaimers become structural, not optional: every report payload carries
  a disclaimer block; every clinical-interpretation UI surface renders it
  non-dismissibly.
- **How:**
  - [ ] Add `disclaimer` as a **required** field in the report schema
        (`packages/ai/src/schemas.ts` and the engine report types in
        `packages/engine/src/types.ts`); schema validation fails without it.
  - [ ] Render in the report UI (`apps/web/src/app/dashboard/reports/`) and on
        analysis/analytics pages; no dismiss control.
  - [ ] Add first-login consent acknowledgment persisted to the existing
        `ConsentRecord` model.
- **Acceptance criteria:**
  - Generating a report without a disclaimer block fails schema validation (test).
  - Playwright test asserts the disclaimer is visible on report and analysis pages
    and has no dismiss affordance.
  - New users cannot reach upload/report features before a `ConsentRecord` row exists.
- **Effort:** S

### P0.1.d — Role-gate the dosing module (API and UI)

- **What:** the dosing/protocol reference module (`packages/ai/src/dosing.ts`) becomes
  reachable **only** by CLINICIAN accounts with verified licenses. Consumer reports
  contain classifications, trends, and education only.
- **How:**
  - [ ] Schema: add `licenseVerifiedAt DateTime?` (and `licenseDocumentUrl`,
        `licenseState`, `npi`) to `User` in `packages/db/prisma/schema.prisma`.
        Verification is granted only via the admin queue (P2 admin backend); until
        that ships, a manual SQL/seed path documented in `docs/`.
  - [ ] API: in `apps/web/src/app/dashboard/reports/generate/route.ts`, branch report
        composition on `session.user.role === 'CLINICIAN' && licenseVerifiedAt != null`;
        the dosing section is never computed — not merely hidden — for other roles.
  - [ ] UI: `dosing-recommendations.tsx` renders only for verified clinicians;
        consumer report view has no dosing tab/section at all.
  - [ ] Defense in depth: `assertConsumerSafe` (P0.1.b) runs on the final payload for
        non-clinician roles regardless of branching.
- **Acceptance criteria:**
  - Integration test: PATIENT session calling report generation receives a payload
    with no dosing keys and no compound strings (guardrail-scanned in the test).
  - Integration test: unverified CLINICIAN is treated as consumer; verified CLINICIAN
    receives the dosing section.
  - Playwright: consumer dashboard exposes no route, tab, or component that renders
    dosing content.
- **Effort:** M

### P0.1.e — Persist guardrail audits to `AuditLog`

- **What:** guardrail audits are currently computed in memory and discarded; the
  `AuditLog` model already exists in `packages/db/prisma/schema.prisma`. Persist every
  guardrail evaluation outcome (GOLD audit-logging requirement, and the evidence base
  for the admin viewer in P2).
- **How:**
  - [ ] Write path in `packages/guardrails` (injected persistence callback, so the
        package stays framework-free) called from the report routes; record: userId,
        role, report id, findings count, action taken (pass/redact/block), engine +
        KB version, timestamp.
  - [ ] Ensure RLS policy on `AuditLog` in `packages/db/prisma/sql/rls.sql` permits
        insert-from-owner, read-by-ADMIN-only.
- **Acceptance criteria:**
  - Every report generation produces exactly one `AuditLog` row (test asserts row
    count and payload shape).
  - A PATIENT session cannot read `AuditLog` rows (RLS test).
- **Effort:** S

### P0.1.f — Content re-sourcing groundwork (with P0 flag, executed through Phase 3)

- **What:** begin migrating clinician-facing reference content from the bodybuilding
  corpus (`to-rag/`, Llewellyn's Anabolics 11th Ed) toward guideline-grade sources
  (Endocrine Society, AUA). Full re-sourcing is Medical-Director-paced; the P0 piece
  is provenance labeling.
- **How:**
  - [ ] Add a `sourceGrade` field (`guideline | review | monograph | other`) to KB doc
        metadata in `packages/kb`; label all 57 docs.
  - [ ] Consumer-visible citations restricted to `guideline`/`review` grades;
        clinician view shows all grades with the grade badge visible.
- **Acceptance criteria:** every KB doc has a grade; consumer report citations contain
  no `monograph/other` sources (test on a generated report fixture).
- **Effort:** S (labeling) — re-sourcing itself is an ongoing content workstream.

---

## P0.2 — Real Extraction Pipeline

**Why.** `packages/ai/src/extraction.ts` returns canned sample data; the live OpenAI
path is a commented TODO there and in
`apps/web/src/app/dashboard/labs/extract/route.ts`. The upload-a-PDF value prop —
the reason patients sign up — does not actually exist. Phase 1 beta is pointless
without it.

### P0.2.a — OpenAI Structured Outputs extraction

- **What:** file → model input (PDF pages as images or native PDF input) →
  zod-validated biomarker JSON with a per-value confidence score.
- **How:**
  - [ ] Tests first: golden test that runs the full pipeline against
        `sample-results/jmc-sample.pdf` and asserts the exact expected biomarker set,
        values, units, and reference ranges (recorded once, reviewed by hand).
  - [ ] Define the extraction zod schema in `packages/ai/src/schemas.ts`:
        `{ biomarkers: [{ name, canonicalCode, value, unit, referenceLow, referenceHigh, collectedAt, confidence, sourcePage }], labName, patientNameDetected }`.
  - [ ] Implement in `packages/ai/src/extraction.ts` using OpenAI Structured Outputs
        (mini-tier model; brief estimates $0.01–0.05/doc): render PDF pages to images
        (or pass PDF directly where supported), one request per document, strict JSON
        schema mode, zod parse on the response.
  - [ ] Wire `apps/web/src/app/dashboard/labs/extract/route.ts` to the real
        implementation; remove the stub. Mock the OpenAI client in unit tests;
        the golden test may run against the live API behind an env flag
        (`EXTRACTION_GOLDEN_LIVE=1`) so CI stays deterministic.
  - [ ] Map extracted names to the canonical biomarker catalog (GOLD biomarker list /
        `Biomarker` model) with an alias table; unmapped names surface for review
        rather than being dropped.
- **Acceptance criteria:**
  - Golden test on `sample-results/jmc-sample.pdf` passes: all expected biomarkers
    extracted with correct values/units.
  - Malformed model output (schema violation) results in a typed failure, never a
    partial write to `LabResult`.
  - No canned data path remains reachable in production code.
- **Effort:** L

### P0.2.b — Human-in-the-loop review before values enter `LabResult`

- **What:** extracted values below a confidence threshold (start: 0.85, tune with beta
  data) are quarantined for user confirmation; nothing enters `LabResult` unreviewed
  below threshold.
- **How:**
  - [ ] Add an `ExtractionReview` staging model (or a `status` +
        `confidence` column pair on `LabResult` with `PENDING_REVIEW | CONFIRMED`
        states) in `packages/db/prisma/schema.prisma`; only `CONFIRMED` rows feed the
        engine.
  - [ ] Review UI under `apps/web/src/app/dashboard/labs/`: side-by-side source-page
        image and extracted value; confirm/edit/reject per value.
  - [ ] Engine input query (`packages/engine` callers) filters to confirmed values.
- **Acceptance criteria:**
  - A value with confidence 0.5 never appears in trends/reports until confirmed
    (integration test).
  - Edited values store both the original extraction and the human correction
    (accuracy-measurement data for Phase 1 go/no-go: ≥95% accuracy target).
- **Effort:** M

### P0.2.c — Cost metering and failure queue

- **What:** per-upload token/cost accounting and an extraction-failure queue surfaced
  to the admin backend (P2).
- **How:**
  - [ ] Store token usage + computed cost per extraction (fields on `LabReport` or a
        new `ExtractionRun` model): model id, input/output tokens, cost, duration,
        outcome (`SUCCESS | LOW_CONFIDENCE | FAILED`).
  - [ ] Failures (unparseable file, schema violation, API error after retries) recorded
        with the error class; user sees a friendly retry message.
- **Acceptance criteria:** every extraction attempt creates exactly one run record;
  cost aggregates queryable per user per month (feeds §5 metering and §9 margin
  tracking in the company plan).
- **Effort:** S

---

## P1 — Billing (Stripe)

**Why.** No billing code exists. Phase 2 (paid patient launch) requires the full
subscribe → meter → enforce → dun loop. Prerequisite: P0.1 complete — Stripe's
restricted-business review is only passable with the compliant product.

### P1.a — Schema and plan model

- **How:**
  - [ ] Prisma additions in `packages/db/prisma/schema.prisma`:
        `Subscription` (userId, stripeCustomerId, stripeSubscriptionId, stripePriceId,
        status, currentPeriodEnd, cancelAtPeriodEnd), `UsageRecord` (userId, kind:
        `UPLOAD | REPORT`, period, count). Plans map to Stripe Price IDs via a small
        config module (`apps/web/src/lib/plans.ts`) — no Plan table needed at launch;
        tiers per `company_implementation.md` §5 (Free / Plus $14.99/mo–$119/yr /
        Pro $99/mo / Enterprise custom).
  - [ ] RLS: subscription rows readable by owner and ADMIN only.
- **Acceptance criteria:** migration applies cleanly; RLS tests pass.
- **Effort:** S

### P1.b — Checkout + Customer Portal

- **How:**
  - [ ] `apps/web/src/app/api/billing/checkout/route.ts`: creates a Stripe Checkout
        Session (mode=subscription) for the selected price; success/cancel URLs back
        to the dashboard.
  - [ ] `apps/web/src/app/api/billing/portal/route.ts`: Stripe Customer Portal session
        for plan changes/cancellation/payment-method updates (buys the admin backend
        time — Stripe hosts the self-serve UI).
  - [ ] Pricing page + upgrade CTAs at quota walls.
- **Acceptance criteria:** mocked-Stripe unit tests for session creation; Playwright
  smoke against Stripe test mode covering subscribe → dashboard shows Plus.
- **Effort:** M

### P1.c — Webhook handler

- **How:**
  - [ ] `apps/web/src/app/api/billing/webhook/route.ts` handling
        `checkout.session.completed`, `customer.subscription.updated`,
        `customer.subscription.deleted`, `invoice.payment_failed`.
  - [ ] **Signature verification** with the webhook secret; reject unsigned payloads.
  - [ ] **Idempotency:** store processed Stripe event ids (small `StripeEvent` table);
        replayed events are no-ops.
  - [ ] `invoice.payment_failed` → mark subscription `PAST_DUE`, trigger dunning email
        (P1 email); Stripe Smart Retries handles retry cadence; final failure →
        `customer.subscription.deleted` → downgrade to Free (data retained, features
        gated).
- **Acceptance criteria:** unit tests per event type from recorded fixtures; replay
  test proves idempotency; tampered-signature request returns 400 and writes nothing.
- **Effort:** M

### P1.d — Plan enforcement (quotas)

- **How:**
  - [ ] `apps/web/src/lib/quota.ts`: `assertQuota(userId, kind)` reading
        `Subscription` + `UsageRecord`; limits per §5 of the company plan — Free:
        manual entry only, 3-biomarker trends, 1 report/quarter; Plus: 10 uploads/mo;
        Pro: 50 uploads/mo/seat; reports unmetered on paid tiers.
  - [ ] Enforce in the upload route (`apps/web/src/app/dashboard/labs/extract/route.ts`)
        and report generation route (`apps/web/src/app/dashboard/reports/generate/route.ts`);
        increment `UsageRecord` atomically with the action.
  - [ ] Trend view limits (3 biomarkers on Free) enforced server-side in the data
        query, not just hidden in UI.
  - [ ] Trial handling: 14-day Plus trial via Stripe `trial_period_days`; trial state
        read from subscription status.
- **Acceptance criteria:** table-driven tests per tier × action; 11th Plus upload in a
  month returns a 402-style quota response with upgrade pointer; quota state cannot be
  bypassed by calling the API directly.
- **Effort:** M

---

## P1 — Transactional Email

**Why.** No email exists; billing (receipts, dunning), auth hygiene (verification,
reset), and extraction UX (done/failed notifications) all need it before Phase 2.

- **How:**
  - [ ] Pick Resend or Postmark (either fine; Resend has the simpler React-email DX).
        Wrapper in `apps/web/src/lib/email.ts`; templates as React Email components.
  - [ ] Flows: email verification, password reset (Credentials flow in Auth.js v5),
        billing receipts + dunning notices (from P1.c), extraction-complete /
        extraction-failed notifications.
  - [ ] **Email verification required before upload:** add `emailVerified` check to
        the upload route guard; Google OAuth accounts count as verified.
  - [ ] SPF/DKIM/DMARC on the sending domain.
- **Acceptance criteria:** provider mocked in tests; each flow has a rendered-template
  snapshot test; unverified account hitting upload gets a verify-first response
  (integration test); manual deliverability check on the live domain.
- **Effort:** M

---

## P2 — Multi-Tenancy for Clinicians

**Why.** `Patient.ownerId` is `@unique` — structurally one user, one patient. The
Clinician Pro and Clinic tiers (Phases 3–4) require a clinician to see a panel of
patients, with patient consent, without breaking the RLS story.

- **How:**
  - [ ] **Schema migration** in `packages/db/prisma/schema.prisma`:
        - Drop `@unique` from `Patient.ownerId` (owner remains the patient-user).
        - Add `Organization` (id, name, plan linkage), `Membership` (userId, orgId,
          role within org), and `PatientAccess` (patientId, granteeUserId or orgId,
          grantedAt, revokedAt, consentRecordId) join tables.
        - Backfill migration: existing patients keep their owner; no data movement.
  - [ ] **RLS update** in `packages/db/prisma/sql/rls.sql`: read access = owner OR an
        active (`revokedAt IS NULL`) `PatientAccess` grant; write access remains
        owner-only except clinician-authored artifacts (visit summaries). Tests first —
        the RLS test suite is the contract here.
  - [ ] **Patient-invite flow:** clinician sends invite (email, P1) → patient accepts
        in-app → `PatientAccess` + `ConsentRecord` created; revocable by the patient
        at any time from settings.
  - [ ] **Clinician panel UI:** `apps/web/src/app/dashboard/patients/` grows from
        single-profile to: patient list with status/last-labs columns, per-patient
        dashboard (reusing existing dashboard components with a `patientId` scope),
        prep-for-visit summary view.
- **Acceptance criteria:**
  - RLS tests: clinician with a grant reads the patient; clinician without a grant
    gets zero rows (not an error leak); revocation takes effect immediately.
  - Patient can list and revoke every active grant from settings (Playwright).
  - Existing single-patient users are unaffected by the migration (regression suite
    green, engine sha256 reproducibility unchanged).
- **Effort:** L

---

## P2 — Admin Backend

**Why.** Decision in `company_implementation.md` §7: required before paid launch.
The ADMIN role already exists in the Prisma `Role` enum; nothing consumes it.

- **How:**
  - [ ] **Route group + gate:** `apps/web/src/app/admin/` gated in `middleware.ts`
        (or the Auth.js authorized callback) on `role === 'ADMIN'`; non-admins get 404,
        not 403, to avoid confirming the route exists.
  - [ ] **Pages** (in build order):
        1. Users & subscriptions — search, plan status, comp/refund actions
           (refunds via Stripe API), account deletion (privacy obligation).
        2. Clinician license-verification queue — pending applications with uploaded
           license documents, NPI/state fields, approve/reject; approval sets
           `licenseVerifiedAt` (consumed by P0.1.d).
        3. Guardrail-audit log viewer — filterable view over `AuditLog` (from P0.1.e).
        4. Extraction failure queue — `ExtractionRun` failures/low-confidence runs
           (from P0.2.c) with retry and inspect actions.
        5. KB version management — list KB corpus versions, doc grades (P0.1.f),
           which version each report used.
        6. Metrics dashboard — signups, activation, MRR (from Subscription), extraction
           cost/doc, churn.
  - [ ] **Audited impersonation:** admin "view as user" issues a time-boxed read-only
        session; every impersonation start/end writes an `AuditLog` row; banner shown
        during impersonation.
- **Acceptance criteria:**
  - Non-ADMIN request to any `/admin` path returns 404 (integration test on every
    admin route).
  - License approval flips exactly the target user's verification state and writes an
    audit row.
  - Impersonation cannot mutate user data (write attempts rejected, test-enforced)
    and always leaves an audit trail.
- **Effort:** L (sequenced: pages 1–2 must land before Phase 2/3 gates; 3–6 can trail)

---

## P3 — Ops & Security Hardening

**Why.** The product runs on a 2GB LXC with no backups, monitoring, or rate limiting.
Acceptable for beta; not for paid customers, and disqualifying for BAA-requiring
clinics (Phase 3/4 gate).

- **How:**
  - [ ] **Backups:** nightly `pg_dump` to encrypted off-box storage (e.g., restic to
        B2/S3), 30-day retention; **quarterly restore drill** documented in
        `docs/` — a backup is only real once restored.
  - [ ] **Monitoring:** Sentry (Next.js SDK) for errors on `apps/web`; uptime checks
        (Better Stack or similar) on the public URL and an authenticated health
        endpoint; pm2 alerting on restart loops.
  - [ ] **Rate limiting:** on auth routes (login, register, reset) and the upload/
        extract route — per-IP and per-user sliding window; a small in-app limiter
        backed by Postgres or an in-memory store is sufficient at this scale (no
        Redis dependency required yet).
  - [ ] **Secret rotation:** move secrets out of the flat `.env` into a documented
        rotation procedure; rotate OpenAI, Stripe, DB, and Auth secrets; calendar
        cadence (quarterly) recorded in `docs/`.
  - [ ] **2FA option:** TOTP second factor for Credentials accounts via Auth.js;
        mandatory for ADMIN and CLINICIAN roles, optional for patients.
  - [ ] **CI pipeline** (if absent): GitHub Actions — typecheck, unit/integration
        tests, Playwright suite (config already in repo per recent commits) on every
        push; extraction golden test in mocked mode by default.
  - [ ] **BAA-capable migration path** (executes at Phase 3 gate): managed Postgres
        (e.g., a HIPAA-eligible managed provider) + HIPAA-eligible app hosting with a
        signed BAA; migration plan = restore-drill procedure pointed at the new
        target, cutover behind Cloudflare with a short DNS TTL; keep the LXC as
        read-only fallback for one billing cycle.
- **Acceptance criteria:**
  - Restore drill produces a working environment from backup, timed and documented.
  - Synthetic error appears in Sentry; downtime alert fires within 5 minutes.
  - Brute-force login attempt is throttled (integration test); upload route rejects
    burst abuse.
  - ADMIN login without 2FA is impossible after cutover.
  - CI is red on any failing test or type error; branch protection enforces it.
- **Effort:** M (initial hardening) + M (BAA migration when triggered)

---

## Sequencing & Dependency Map

Solo-developer estimates; weeks are working estimates, not commitments.

| Order | Workstream | Depends on | Est. weeks | Company phase gate |
|---|---|---|---|---|
| 1 | P0.1 Compliance & integrity | — | 2–3 | Phase 0 exit |
| 2 | P0.2 Extraction pipeline | P0.1 (report paths stable) | 3 | Phase 0 exit / Phase 1 entry |
| 3 | P1 Email | — (parallelizable with P0.2 tail) | 1 | Phase 2 entry |
| 4 | P1 Billing | P0.1 (Stripe underwriting), P1 Email (receipts/dunning) | 2–3 | Phase 2 entry |
| 5 | P2 Admin (pages 1–2) | P1 Billing (subscriptions to manage) | 1–2 | Phase 2 entry (users/subs), Phase 3 entry (license queue) |
| 6 | P2 Multi-tenancy | P0.1.d (role model), P2 Admin license queue | 2–3 | Phase 3 entry |
| 7 | P2 Admin (pages 3–6) | P0.1.e, P0.2.c | 1 | Phase 3 |
| 8 | P3 Hardening (initial) | — (start alongside 4–5) | 1–2 | Phase 2 exit |
| 9 | P3 BAA migration | P3 initial, first clinic prospect | 1–2 | Phase 3/4 gate |

```
P0.1 ──► P0.2 ──► [Phase 1 beta]
  │
  ├──► P1 Billing ◄── P1 Email          ──► [Phase 2 paid launch]
  │        │
  │        └──► P2 Admin (users/subs)
  │
  └──► P2 Multi-tenancy ◄── P2 Admin (license queue)
                │
                └──► P3 BAA migration   ──► [Phase 3 clinician tier]
```

**Critical path to first revenue:** P0.1 → P0.2 → (Email ∥ Billing) → Admin pages 1–2
≈ **9–12 solo weeks**, consistent with the company plan's Phase 0 (weeks 1–6) +
Phase 1 (weeks 6–12) + Phase 2 (month 4) timeline.

**Standing rules for every workstream:**
- Tests first (strict TDD); acceptance criteria above are the test list.
- No feature that outputs dosing content ever ships without the P0.1.b guardrail and
  P0.1.d role gate in its path — this is a permanent invariant, not a Phase 0 task.
- Schema changes ship with RLS updates and RLS tests in the same change set.
