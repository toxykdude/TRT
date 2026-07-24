-- P0.2.a — real extraction pipeline.
--   • LabResult: confidence + review-status gate (P0.2.b); nullable biomarkerId
--     + rawName so UNMAPPED biomarkers surface for review instead of being dropped.
--   • ExtractionRun: one row per attempt (model, tokens, cost, duration, outcome).
-- RLS: lab_results already has an ownerId policy; the new columns follow the same
-- owner-scoped pattern (no rls.sql change needed). extraction_runs holds no PHI.

-- ── New enums ────────────────────────────────────────────────────────────────
CREATE TYPE "LabResultReviewStatus" AS ENUM ('CONFIRMED', 'PENDING_REVIEW');
CREATE TYPE "ExtractionOutcome" AS ENUM ('SUCCESS', 'LOW_CONFIDENCE', 'FAILED');

-- ── lab_results: allow unmapped biomarkers (biomarkerId nullable) ───────────
ALTER TABLE "lab_results" ALTER COLUMN "biomarkerId" DROP NOT NULL;

-- printed name for unmapped results (null when mapped)
ALTER TABLE "lab_results" ADD COLUMN "rawName" TEXT;

ALTER TABLE "lab_results" ADD COLUMN "confidence" DOUBLE PRECISION;
ALTER TABLE "lab_results" ADD COLUMN "reviewStatus" "LabResultReviewStatus" NOT NULL DEFAULT 'CONFIRMED';

CREATE INDEX "lab_results_reviewStatus_idx" ON "lab_results"("reviewStatus");

-- ── extraction_runs ─────────────────────────────────────────────────────────
CREATE TABLE "extraction_runs" (
  "id" TEXT NOT NULL,
  "labReportId" TEXT NOT NULL,
  "modelId" TEXT NOT NULL,
  "inputTokens" INTEGER,
  "outputTokens" INTEGER,
  "costUsd" DOUBLE PRECISION,
  "durationMs" INTEGER,
  "outcome" "ExtractionOutcome" NOT NULL,
  "errorClass" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "extraction_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "extraction_runs_labReportId_idx" ON "extraction_runs"("labReportId");

ALTER TABLE "extraction_runs"
  ADD CONSTRAINT "extraction_runs_labReportId_fkey"
  FOREIGN KEY ("labReportId") REFERENCES "lab_reports"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
