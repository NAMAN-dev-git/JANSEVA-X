-- Batch 9 Phase 2 extends only the durable ticket. ApplicationStatus and the
-- existing employee-review lifecycle are deliberately unchanged.
ALTER TYPE "ApplicationSubmissionTicketStatus" ADD VALUE IF NOT EXISTS 'PROCESSING';
ALTER TYPE "ApplicationSubmissionTicketStatus" ADD VALUE IF NOT EXISTS 'COMPLETED';
ALTER TYPE "ApplicationSubmissionTicketStatus" ADD VALUE IF NOT EXISTS 'FAILED';

ALTER TABLE "application_submission_tickets"
  ADD COLUMN "processing_started_at" TIMESTAMP(3),
  ADD COLUMN "completed_at" TIMESTAMP(3),
  ADD COLUMN "failed_at" TIMESTAMP(3),
  ADD COLUMN "attempt_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "last_error" VARCHAR(250);

CREATE INDEX "application_submission_tickets_status_processing_started_at_idx"
  ON "application_submission_tickets"("status", "processing_started_at");
