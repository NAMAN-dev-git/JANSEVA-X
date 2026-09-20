-- Batch 7 is intentionally additive. It neither deletes nor rewrites exam
-- applications, documents, payments, or existing timeline data.
CREATE TYPE "ExamSubmissionAttemptStatus" AS ENUM ('RECEIVED', 'ACCEPTED', 'REJECTED_PERMANENT');
CREATE TYPE "ExamDeadlineAssessment" AS ENUM ('SERVER_ON_TIME', 'CLIENT_CLAIMED_ON_TIME_UNVERIFIED', 'SERVER_LATE');

ALTER TABLE "government_exams"
  ADD COLUMN "application_deadline_at" TIMESTAMP(3),
  ADD COLUMN "application_time_zone" VARCHAR(64);

-- Backfill legacy rows once so the new non-null authoritative fields can be
-- introduced safely. SSC CGL's demo deadline is the stated Asia/Kolkata
-- instant. Other legacy demo rows retain a conservative compatibility value;
-- runtime deadline comparisons only use application_deadline_at.
UPDATE "government_exams"
SET
  "application_deadline_at" = CASE
    WHEN "slug" = 'ssc-cgl-2026-demo' THEN TIMESTAMP '2026-10-10 18:29:59.999'
    ELSE "application_end_date"::timestamp + INTERVAL '23 hours 59 minutes 59.999 seconds'
  END,
  "application_time_zone" = CASE
    WHEN "slug" = 'ssc-cgl-2026-demo' THEN 'Asia/Kolkata'
    ELSE 'UTC'
  END
WHERE "application_deadline_at" IS NULL;

ALTER TABLE "government_exams"
  ALTER COLUMN "application_deadline_at" SET NOT NULL,
  ALTER COLUMN "application_time_zone" SET NOT NULL;

CREATE TABLE "exam_submission_attempts" (
  "exam_submission_attempt_id" UUID NOT NULL,
  "exam_application_id" UUID NOT NULL,
  "idempotency_key" UUID NOT NULL,
  "payload_hash" CHAR(64) NOT NULL,
  "client_captured_at" TIMESTAMP(3) NOT NULL,
  "server_received_at" TIMESTAMP(3) NOT NULL,
  "server_accepted_at" TIMESTAMP(3),
  "deadline_at_snapshot" TIMESTAMP(3) NOT NULL,
  "deadline_assessment" "ExamDeadlineAssessment" NOT NULL,
  "status" "ExamSubmissionAttemptStatus" NOT NULL DEFAULT 'RECEIVED',
  "delivery_attempt_count" INTEGER NOT NULL DEFAULT 1,
  "last_delivery_at" TIMESTAMP(3),
  "failure_code" VARCHAR(100),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "exam_submission_attempts_pkey" PRIMARY KEY ("exam_submission_attempt_id")
);

CREATE UNIQUE INDEX "exam_submission_attempts_idempotency_key_key"
  ON "exam_submission_attempts"("idempotency_key");
CREATE INDEX "exam_submission_attempts_exam_application_id_created_at_idx"
  ON "exam_submission_attempts"("exam_application_id", "created_at");
CREATE INDEX "exam_submission_attempts_exam_application_id_status_idx"
  ON "exam_submission_attempts"("exam_application_id", "status");
CREATE INDEX "exam_submission_attempts_status_created_at_idx"
  ON "exam_submission_attempts"("status", "created_at");

ALTER TABLE "exam_submission_attempts"
  ADD CONSTRAINT "exam_submission_attempts_exam_application_id_fkey"
  FOREIGN KEY ("exam_application_id") REFERENCES "exam_applications"("exam_application_id")
  ON DELETE CASCADE ON UPDATE CASCADE;
