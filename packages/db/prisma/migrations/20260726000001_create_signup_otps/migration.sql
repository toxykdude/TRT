-- Restore the pending-signup table declared by the SignupOtp Prisma model.
-- Keep the table and its unique lookup index atomic: an unexpected pre-existing
-- object must fail the migration rather than silently accepting schema drift.
BEGIN;

CREATE TABLE "signup_otps" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "name" TEXT,
  "passwordHash" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "signup_otps_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "signup_otps_email_key" ON "signup_otps"("email");

COMMIT;
