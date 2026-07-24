-- ─────────────────────────────────────────────────────────────────────────────
-- Verify a clinician's license (GOLD §2.4) — manual admin path (P0.1.d).
--
-- The dosing/protocol reference module requires role = CLINICIAN *and*
-- licenseVerifiedAt != null. Until the admin verification UI lands (Phase 2),
-- a verified-clinician account is provisioned with this script so the P0.1.d
-- integration tests and manual QA can exercise the dosing surface.
--
-- Usage (psql — run as a superuser / the service role):
--   psql "$DATABASE_URL" \
--     -f packages/db/prisma/sql/verify-clinician.sql \
--     -v email='clinician@example.com' \
--     -v state='NY' \
--     -v npi='1234567890'
--
-- To REVOKE verification (e.g. tear down a test clinician):
--   psql "$DATABASE_URL" \
--     -f packages/db/prisma/sql/verify-clinician.sql \
--     -v email='clinician@example.com' -v action='revoke'
-- ─────────────────────────────────────────────────────────────────────────────

\set action :action
\if :action = 'revoke'
  UPDATE users
  SET "licenseVerifiedAt" = NULL,
      "licenseState"      = NULL,
      "npi"               = NULL
  WHERE email = :'email';
\else
  UPDATE users
  SET "role"              = 'CLINICIAN',
      "licenseVerifiedAt" = NOW(),
      "licenseState"      = :'state',
      "npi"               = :'npi'
  WHERE email = :'email';
\endif
