-- SaaS implementation (develop_saas.md P0.1.d + P1.a):
--   • Clinician license verification fields on users (GOLD §2.4 gating)
--   • Billing tables: subscriptions, payments, payment_events, usage_records
--     (Wompi + PayPal providers; quotas per company_implementation.md §5)

-- ── Clinician license verification ──────────────────────────────────────────
ALTER TABLE "users" ADD COLUMN "licenseVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "licenseDocumentUrl" TEXT,
  ADD COLUMN "licenseState" TEXT,
  ADD COLUMN "npi" TEXT;

-- ── Enums ───────────────────────────────────────────────────────────────────
CREATE TYPE "PaymentProvider" AS ENUM ('WOMPI', 'PAYPAL', 'MANUAL');
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'PAST_DUE', 'CANCELED', 'EXPIRED');
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'APPROVED', 'DECLINED', 'ERROR', 'VOIDED');
CREATE TYPE "UsageKind" AS ENUM ('UPLOAD', 'REPORT');

-- ── subscriptions ───────────────────────────────────────────────────────────
CREATE TABLE "subscriptions" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "provider" "PaymentProvider" NOT NULL,
  "planCode" TEXT NOT NULL,
  "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
  "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
  "externalRef" TEXT,
  "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "subscriptions_userId_status_idx" ON "subscriptions"("userId", "status");
ALTER TABLE "subscriptions"
  ADD CONSTRAINT "subscriptions_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── payments ────────────────────────────────────────────────────────────────
CREATE TABLE "payments" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "provider" "PaymentProvider" NOT NULL,
  "reference" TEXT NOT NULL,
  "externalId" TEXT,
  "amountInCents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL,
  "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
  "planCode" TEXT NOT NULL,
  "raw" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "payments_reference_key" ON "payments"("reference");
CREATE INDEX "payments_userId_idx" ON "payments"("userId");
ALTER TABLE "payments"
  ADD CONSTRAINT "payments_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── payment_events (webhook idempotency) ────────────────────────────────────
CREATE TABLE "payment_events" (
  "id" TEXT NOT NULL,
  "provider" "PaymentProvider" NOT NULL,
  "eventId" TEXT NOT NULL,
  "payload" JSONB,
  "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_events_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "payment_events_provider_eventId_key" ON "payment_events"("provider", "eventId");

-- ── usage_records (quota metering) ──────────────────────────────────────────
CREATE TABLE "usage_records" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "kind" "UsageKind" NOT NULL,
  "period" TEXT NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "usage_records_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "usage_records_userId_kind_period_key" ON "usage_records"("userId", "kind", "period");
ALTER TABLE "usage_records"
  ADD CONSTRAINT "usage_records_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
