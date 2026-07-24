-- ─────────────────────────────────────────────────────────────────────────────
-- Row Level Security for the TRT Clinical Decision Support Dashboard
-- GOLD.md §8 (Security & Compliance), AGENTS.md §6.
--
-- IMPORTANT: Prisma maps camelCase fields to camelCase columns by default
-- ("ownerId", "userId", etc.). This SQL uses those exact column names.
--
-- Strategy
--   • Every table holding patient data has RLS enabled.
--   • Tenancy key = the owning user's id, in an `"ownerId"` column (directly on
--     Patient; denormalized onto child rows for RLS efficiency).
--   • The application sets a session variable per request:
--         SET LOCAL app.user_id = '<user-id>';
--     (see packages/db/src/index.ts). Policies compare "ownerId" against it.
--   • The 'trt' role is the only role the app connects as.
--
-- RLS is defense-in-depth, not a substitute for app-layer authorization.
-- ─────────────────────────────────────────────────────────────────────────────

-- Helper: read the current request's user id (empty string when unset → matches nothing).
CREATE OR REPLACE FUNCTION app_user_id() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT COALESCE(current_setting('app.user_id', true), '');
$$;

-- Grant the app role DML on all tables/sequences.
GRANT USAGE ON SCHEMA public TO trt;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO trt;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO trt;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO trt;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO trt;

-- The 'trt' role bypasses RLS so it can perform elevated operations that have
-- no user context yet — specifically USER CREATION AT SIGNUP and admin/maintenance
-- jobs. This does NOT weaken security in the app: every normal request runs via
-- prismaFor("userId") which sets app.user_id, and the policies below still apply to
-- the 'trt' role. BYPASSRLS is the escape hatch for the small set of operations
-- (signup) that legitimately need it. The service client (servicePrisma) is the
-- ONLY code path that should rely on this; never use it to serve patient data.
-- Run by a superuser (postgres):
-- ALTER ROLE trt BYPASSRLS;

-- ── Patient: the root tenancy object ─────────────────────────────────────────
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE patients FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS patients_owner_isolation ON patients;
CREATE POLICY patients_owner_isolation ON patients
  FOR ALL TO trt
  USING ("ownerId" = app_user_id())
  WITH CHECK ("ownerId" = app_user_id());

-- ── Child tables: "ownerId" denormalized ───────────────────────────────────────
ALTER TABLE lab_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_reports FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lab_reports_owner_isolation ON lab_reports;
CREATE POLICY lab_reports_owner_isolation ON lab_reports
  FOR ALL TO trt USING ("ownerId" = app_user_id()) WITH CHECK ("ownerId" = app_user_id());

ALTER TABLE lab_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_results FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lab_results_owner_isolation ON lab_results;
CREATE POLICY lab_results_owner_isolation ON lab_results
  FOR ALL TO trt USING ("ownerId" = app_user_id()) WITH CHECK ("ownerId" = app_user_id());

ALTER TABLE medications ENABLE ROW LEVEL SECURITY;
ALTER TABLE medications FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS medications_owner_isolation ON medications;
CREATE POLICY medications_owner_isolation ON medications
  FOR ALL TO trt USING ("ownerId" = app_user_id()) WITH CHECK ("ownerId" = app_user_id());

ALTER TABLE symptom_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE symptom_entries FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS symptom_entries_owner_isolation ON symptom_entries;
CREATE POLICY symptom_entries_owner_isolation ON symptom_entries
  FOR ALL TO trt USING ("ownerId" = app_user_id()) WITH CHECK ("ownerId" = app_user_id());

ALTER TABLE body_compositions ENABLE ROW LEVEL SECURITY;
ALTER TABLE body_compositions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS body_comps_owner_isolation ON body_compositions;
CREATE POLICY body_comps_owner_isolation ON body_compositions
  FOR ALL TO trt USING ("ownerId" = app_user_id()) WITH CHECK ("ownerId" = app_user_id());

ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS reports_owner_isolation ON reports;
CREATE POLICY reports_owner_isolation ON reports
  FOR ALL TO trt USING ("ownerId" = app_user_id()) WITH CHECK ("ownerId" = app_user_id());

-- ── User-owned tables (auth + consent + audit) ───────────────────────────────
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS accounts_user_isolation ON accounts;
CREATE POLICY accounts_user_isolation ON accounts
  FOR ALL TO trt USING ("userId" = app_user_id()) WITH CHECK ("userId" = app_user_id());

ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sessions_user_isolation ON sessions;
CREATE POLICY sessions_user_isolation ON sessions
  FOR ALL TO trt USING ("userId" = app_user_id()) WITH CHECK ("userId" = app_user_id());

ALTER TABLE consent_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE consent_records FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS consent_user_isolation ON consent_records;
CREATE POLICY consent_user_isolation ON consent_records
  FOR ALL TO trt USING ("userId" = app_user_id()) WITH CHECK ("userId" = app_user_id());

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audit_user_isolation ON audit_logs;
CREATE POLICY audit_user_isolation ON audit_logs
  FOR ALL TO trt USING ("userId" = app_user_id()) WITH CHECK ("userId" = app_user_id());

-- The users table: a user reads/updates only their own row.
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS users_self_only ON users;
CREATE POLICY users_self_only ON users
  FOR ALL TO trt USING (id = app_user_id()) WITH CHECK (id = app_user_id());

-- The biomarker catalog is reference data: readable by everyone, writable only
-- by a privileged role (not 'trt'). RLS is enabled so it's explicit.
ALTER TABLE biomarkers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS biomarkers_read_all ON biomarkers;
CREATE POLICY biomarkers_read_all ON biomarkers
  FOR SELECT TO trt USING (true);

-- NOTE on signup: creating the first users row for a new account can't be done
-- under RLS (there's no "userId" yet). Auth.js signup runs with a *service*
-- connection (bypassing RLS) — see packages/db/src/index.ts `servicePrisma`.
-- In this local-Postgres setup the same 'trt' role is used, so signup needs
-- the policy to allow the insert. The users_self_only WITH CHECK requires
-- id = app_user_id(); during signup we set app.user_id to the new user's id
-- AFTER generation but BEFORE insert is impossible. Therefore signup is
-- performed via a dedicated elevated path. See apps/web register action.

-- ── Billing tables (P1 — Wompi + PayPal) ────────────────────────────────────
-- Subscriptions & payments are written ONLY by server-side billing code
-- (checkout/webhook handlers, admin comp actions). End users may read their
-- own rows; all writes flow through the service path.

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS subscriptions_owner_read ON subscriptions;
CREATE POLICY subscriptions_owner_read ON subscriptions
  FOR SELECT TO trt USING ("userId" = app_user_id());

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payments_owner_read ON payments;
CREATE POLICY payments_owner_read ON payments
  FOR SELECT TO trt USING ("userId" = app_user_id());

-- Webhook idempotency records: service-only, no end-user access at all.
ALTER TABLE payment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_events FORCE ROW LEVEL SECURITY;

ALTER TABLE usage_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_records FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS usage_records_owner_isolation ON usage_records;
CREATE POLICY usage_records_owner_isolation ON usage_records
  FOR ALL TO trt USING ("userId" = app_user_id()) WITH CHECK ("userId" = app_user_id());

-- ── Audit logs: insert-from-owner, read-by-admin-only (P0.1.e) ──────────────
-- Guardrail audits and admin actions are compliance evidence; end users must
-- not browse them. Admin reads happen through the service path (app-layer
-- role check), which bypasses RLS by design.
DROP POLICY IF EXISTS audit_user_isolation ON audit_logs;
DROP POLICY IF EXISTS audit_insert_owner ON audit_logs;
DROP POLICY IF EXISTS audit_read_admin ON audit_logs;
CREATE POLICY audit_insert_owner ON audit_logs
  FOR INSERT TO trt WITH CHECK ("userId" = app_user_id());
-- No SELECT/UPDATE/DELETE policy for 'trt' → denied by default under RLS.
