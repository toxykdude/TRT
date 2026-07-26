-- Email-OTP 2FA on login + OTP password recovery + password typo protection.
--   • login_otps — mirrors signup_otps' shape. Its row's EXISTENCE is the
--     proof a password check already passed (requestLoginOtp only creates it
--     after verifyUserPassword succeeds); the login-otp Credentials provider
--     consumes it and is the ONLY path that can mint a session.
--   • password_reset_otps — same shape, drives the forgot/reset-password flow.
--   • users.passwordChangedAt — stamped by resetPassword. session strategy is
--     'jwt', so resetting the password alone does not revoke tokens already
--     in the wild; the auth.ts jwt callback rejects any token minted before
--     this timestamp, which is what actually kills those sessions.

-- ── users: password-change epoch for JWT invalidation ───────────────────────
ALTER TABLE "users" ADD COLUMN "passwordChangedAt" TIMESTAMP(3);

-- ── login_otps ───────────────────────────────────────────────────────────────
-- sendCount/windowStartedAt are a real daily-send-cap counter (a rolling 24h
-- window anchored at windowStartedAt) — NOT derived from createdAt/updatedAt,
-- which cannot yield an exact send count.
CREATE TABLE "login_otps" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "sendCount" INTEGER NOT NULL DEFAULT 1,
  "windowStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "login_otps_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "login_otps_email_key" ON "login_otps"("email");

-- ── password_reset_otps ───────────────────────────────────────────────────────
CREATE TABLE "password_reset_otps" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "sendCount" INTEGER NOT NULL DEFAULT 1,
  "windowStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "password_reset_otps_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "password_reset_otps_email_key" ON "password_reset_otps"("email");
