-- Subscription trial window (develop_saas.md P1.b remainder).
-- While now < trialEndsAt, the quota service treats the holder as being on the
-- subscription's plan (trial access). Nullable: null when no trial is active.
ALTER TABLE "subscriptions" ADD COLUMN "trialEndsAt" TIMESTAMP(3);
