# Clinician License Verification (GOLD §2.4)

The dosing/protocol reference module is the highest-risk surface in the product.
Per the **Prime Directive** (GOLD §2.3), dosing/protocol content is computed
**only** for a `CLINICIAN` whose license is verified (`licenseVerifiedAt != null`).
Every other role — `PATIENT`, `ADMIN`, and an **unverified** `CLINICIAN` — is
treated as a consumer: dosing is never computed for them and the final payload
is fail-closed audited (`assertConsumerSafe`).

## How the gate works

1. **Route (authoritative):** `apps/web/src/app/[locale]/dashboard/reports/generate/route.ts`
   re-reads `role` + `licenseVerifiedAt` from the DB row. The JWT `role` is only
   a coarse UI gate — license changes must take effect immediately, so the DB is
   the source of truth. See `apps/web/src/lib/report-policy.ts`
   (`isVerifiedClinician`, `decideReportPolicy`).
2. **UI (defense-in-depth):** `apps/web/src/components/dashboard/index.tsx`
   accepts a `viewerCanSeeDosing` prop (default `false`) computed server-side in
   `reports/[id]/page.tsx`. Even if a stored report held dosing, it is never
   rendered for a non-verified-clinician viewer.
3. **Fail-closed audit:** every consumer payload passes `assertConsumerSafe`
   before it is persisted; a `GuardrailViolationError` aborts the generation.

## Provisioning a verified clinician (manual admin path)

The admin verification queue UI is **Phase 2**. Until then, provision a verified
clinician with one of these so the P0.1.d tests / manual QA can exercise dosing:

### Option A — seed script (recommended)

```bash
pnpm --filter @trt/db exec tsx prisma/seed-clinician.ts \
  --email clinician@example.com --state NY --npi 1234567890
```

Revoke (clears the license fields; role stays `CLINICIAN`):

```bash
pnpm --filter @trt/db exec tsx prisma/seed-clinician.ts \
  --email clinician@example.com --revoke
```

### Option B — raw SQL

```bash
psql "$DATABASE_URL" \
  -f packages/db/prisma/sql/verify-clinician.sql \
  -v email='clinician@example.com' -v state='NY' -v npi='1234567890'
```

## Acceptance (P0.1.d)

- A `PATIENT` session payload has no dosing keys and no compound strings.
- An **unverified** `CLINICIAN` is treated as a consumer (no dosing).
- Only a **verified** `CLINICIAN` (`licenseVerifiedAt != null`) receives dosing.
- Proven by `apps/web/tests/unit/report-policy.test.ts`.

## Starting a trial (manual admin path — Phase 2 UI)

A trial grants the subscription's plan while `now < trialEndsAt`
(`apps/web/src/lib/quota.ts` → `isTrialActive` / `getEffectivePlanCode`). The
full trial-start UI is Phase 2; until then set the window manually:

```bash
psql "$DATABASE_URL" -c \
  "UPDATE subscriptions SET \"trialEndsAt\" = NOW() + INTERVAL '14 days' \
   WHERE \"userId\" = (SELECT id FROM users WHERE email = 'user@example.com') \
   AND status = 'ACTIVE';"
```

(There must be an existing `subscriptions` row for the user — trials extend a
subscription record, they don't create one.) Verified by
`apps/web/tests/unit/quota.test.ts` → `getEffectivePlanCode — trial grants the plan`.
