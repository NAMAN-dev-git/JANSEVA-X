-- Batch 9 Phase 1 is additive: generic application lifecycle statuses remain
-- unchanged and existing submitted applications are not rewritten.
CREATE TYPE "ApplicationSubmissionTicketStatus" AS ENUM ('PENDING');

CREATE TABLE "application_submission_tickets" (
  "application_submission_ticket_id" UUID NOT NULL,
  "application_id" UUID NOT NULL,
  "citizen_id" UUID NOT NULL,
  "idempotency_key" UUID NOT NULL,
  "status" "ApplicationSubmissionTicketStatus" NOT NULL DEFAULT 'PENDING',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "application_submission_tickets_pkey" PRIMARY KEY ("application_submission_ticket_id")
);

CREATE UNIQUE INDEX "application_submission_tickets_application_id_key"
  ON "application_submission_tickets"("application_id");
CREATE UNIQUE INDEX "application_submission_tickets_idempotency_key_key"
  ON "application_submission_tickets"("idempotency_key");
CREATE INDEX "application_submission_tickets_citizen_id_created_at_idx"
  ON "application_submission_tickets"("citizen_id", "created_at");
CREATE INDEX "application_submission_tickets_status_created_at_idx"
  ON "application_submission_tickets"("status", "created_at");

ALTER TABLE "application_submission_tickets"
  ADD CONSTRAINT "application_submission_tickets_application_id_fkey"
  FOREIGN KEY ("application_id") REFERENCES "applications"("application_id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "application_submission_tickets"
  ADD CONSTRAINT "application_submission_tickets_citizen_id_fkey"
  FOREIGN KEY ("citizen_id") REFERENCES "citizen_profiles"("citizen_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
