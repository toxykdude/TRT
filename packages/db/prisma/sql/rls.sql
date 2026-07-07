-- ─────────────────────────────────────────────────────────────────────────────
-- Row Level Security for the TRT Clinical Decision Support Dashboard
-- GOLD.md §8 (Security & Compliance), AGENTS.md §6.
--
-- Strategy
--   • Every table holding patient data has RLS enabled.
--   • Tenancy key = the owning user's id, stored in an `owner_id` column
--     (directly on Patient; denormalized onto child rows for RLS efficiency).
--   • The application sets a session variable per request:
--         SET LOCAL app.user_id = '<user-id>';
--     (see packages/db/src/index.ts). Policies compare owner_id against it.
--   • A role 'trt' (the app's DB role) must be granted only DML on these tables.
--
-- IMPORTANT: RLS is defense-in-depth. It is NOT a substitute for app-layer
-- authorization. Both layers must agree.
-- ─────────────────────────────────────────────────────────────────────────────

-- Helper: read the current request's user id (empty string when unset → matches nothing).
CREATE OR REPLACE FUNCTION app_user_id() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT COALESCE(current_setting('app.user_id', true), '');
$$;

-- Grant the app role DML on all tables/sequences. (Run after migrations.)
-- The 'trt' role is the only role the app should connect as.
GRANT USAGE ON SCHEMA public TO trt;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO trt;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO trt;
-- Future tables created by later migrations should be grantable too.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO trt;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO trt;

-- ── Patient: the root tenancy object ─────────────────────────────────────────
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE patients FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS patients_owner_isolation ON patients;
CREATE POLICY patients_owner_isolation ON patients
  FOR ALL TO trt
  USING (owner_id = app_user_id())
  WITH CHECK (owner_id = app_user_id());

-- ── Child tables: owner_id denormalized ──────────────────────────────────────
-- For each child, isolation is simply owner_id = current user.
-- Lab reports
ALTER TABLE lab_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_reports FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lab_reports_owner_isolation ON lab_reports;
CREATE POLICY lab_reports_owner_isolation ON lab_reports
  FOR ALL TO trt USING (owner_id = app_user_id()) WITH CHECK (owner_id = app_user_id());

-- Lab results
ALTER TABLE lab_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_results FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lab_results_owner_isolation ON lab_results;
CREATE POLICY lab_results_owner_isolation ON lab_results
  FOR ALL TO trt USING (owner_id = app_user_id()) WITH CHECK (owner_id = app_user_id());

-- Medications
ALTER TABLE medications ENABLE ROW LEVEL SECURITY;
ALTER TABLE medications FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS medications_owner_isolation ON medications;
CREATE POLICY medications_owner_isolation ON medications
  FOR ALL TO trt USING (owner_id = app_user_id()) WITH CHECK (owner_id = app_user_id());

-- Symptom entries
ALTER TABLE symptom_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE symptom_entries FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS symptom_entries_owner_isolation ON symptom_entries;
CREATE POLICY symptom_entries_owner_isolation ON symptom_entries
  FOR ALL TO trt USING (owner_id = app_user_id()) WITH CHECK (owner_id = app_user_id());

-- Body composition
ALTER TABLE body_compositions ENABLE ROW LEVEL SECURITY;
ALTER TABLE body_compositions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS body_comps_owner_isolation ON body_compositions;
CREATE POLICY body_comps_owner_isolation ON body_compositions
  FOR ALL TO trt USING (owner_id = app_user_id()) WITH CHECK (owner_id = app_user_id());

-- Reports
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS reports_owner_isolation ON reports;
CREATE POLICY reports_owner_isolation ON reports
  FOR ALL TO trt USING (owner_id = app_user_id()) WITH CHECK (owner_id = app_user_id());

-- ── User-owned tables (auth + consent + audit) ───────────────────────────────
-- A user sees only their own rows on these tables too.
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS accounts_user_isolation ON accounts;
CREATE POLICY accounts_user_isolation ON accounts
  FOR ALL TO trt USING (user_id = app_user_id()) WITH CHECK (user_id = app_user_id());

ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sessions_user_isolation ON sessions;
CREATE POLICY sessions_user_isolation ON sessions
  FOR ALL TO trt USING (user_id = app_user_id()) WITH CHECK (user_id = app_user_id());

ALTER TABLE consent_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE consent_records FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS consent_user_isolation ON consent_records;
CREATE POLICY consent_user_isolation ON consent_records
  FOR ALL TO trt USING (user_id = app_user_id()) WITH CHECK (user_id = app_user_id());

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audit_user_isolation ON audit_logs;
CREATE POLICY audit_user_isolation ON audit_logs
  FOR ALL TO trt USING (user_id = app_user_id()) WITH CHECK (user_id = app_user_id());

-- The users table itself: a user reads/updates only their own row.
-- (Account creation during signup is handled via a service role / bypass; the app
-- never creates arbitrary users as the authenticated 'trt' role — Auth.js does
-- that with elevated privileges, or via a dedicated signup path.)
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

-- verification_tokens: not user-tenanted; used during email flows. Leave
-- un-RLS'd but only the app role accesses it. (No PHI stored here.)

-- NOTE on signup: creating the first users row for a new account can't be done
-- under RLS (there's no user_id yet). Auth.js signup runs with a *service*
-- connection (bypassing RLS) — see packages/db/src/index.ts `servicePrisma`.
