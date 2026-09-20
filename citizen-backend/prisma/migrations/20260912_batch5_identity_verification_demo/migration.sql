-- Batch 5 identity-verification demo. Additive only: Verification continues to
-- store identity records; this table stores QR-session state and a hash of the
-- pairing challenge, never biometric material.
CREATE TYPE "FingerprintSessionStatus" AS ENUM ('PENDING_PAIRING', 'PAIRED', 'COMPLETED', 'EXPIRED');
CREATE TYPE "FingerprintStep" AS ENUM ('RIGHT_INDEX', 'RIGHT_MIDDLE', 'RIGHT_RING', 'RIGHT_PINKY', 'RIGHT_THUMB');
CREATE TYPE "FingerprintSessionEventType" AS ENUM ('CREATED', 'RESTARTED', 'PAIRED', 'STEP_COMPLETED', 'COMPLETED', 'EXPIRED');

CREATE TABLE "fingerprint_sessions" (
  "fingerprint_session_id" UUID NOT NULL,
  "verification_id" UUID NOT NULL,
  "application_id" UUID NOT NULL,
  "citizen_id" UUID NOT NULL,
  "status" "FingerprintSessionStatus" NOT NULL DEFAULT 'PENDING_PAIRING',
  "pairing_challenge_hash" CHAR(64) NOT NULL,
  "provider_reference" VARCHAR(255) NOT NULL,
  "completed_steps" "FingerprintStep"[] NOT NULL DEFAULT ARRAY[]::"FingerprintStep"[],
  "paired_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "expires_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "fingerprint_sessions_pkey" PRIMARY KEY ("fingerprint_session_id"),
  CONSTRAINT "fingerprint_sessions_verification_id_key" UNIQUE ("verification_id"),
  CONSTRAINT "fingerprint_sessions_verification_id_fkey" FOREIGN KEY ("verification_id") REFERENCES "verifications"("verification_id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "fingerprint_sessions_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("application_id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "fingerprint_sessions_citizen_id_fkey" FOREIGN KEY ("citizen_id") REFERENCES "citizen_profiles"("citizen_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "fingerprint_sessions_application_id_citizen_id_idx" ON "fingerprint_sessions"("application_id", "citizen_id");
CREATE INDEX "fingerprint_sessions_expires_at_idx" ON "fingerprint_sessions"("expires_at");

CREATE TABLE "fingerprint_session_events" (
  "fingerprint_session_event_id" UUID NOT NULL,
  "fingerprint_session_id" UUID NOT NULL,
  "type" "FingerprintSessionEventType" NOT NULL,
  "step" "FingerprintStep",
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fingerprint_session_events_pkey" PRIMARY KEY ("fingerprint_session_event_id"),
  CONSTRAINT "fingerprint_session_events_fingerprint_session_id_fkey" FOREIGN KEY ("fingerprint_session_id") REFERENCES "fingerprint_sessions"("fingerprint_session_id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "fingerprint_session_events_fingerprint_session_id_created_at_idx"
  ON "fingerprint_session_events"("fingerprint_session_id", "created_at");

-- Document verifications remain many-per-application. Identity demo records are
-- one-per-type per application, preventing concurrent retry duplicates.
CREATE UNIQUE INDEX "verifications_identity_application_type_key"
  ON "verifications" ("application_id", "type")
  WHERE "document_id" IS NULL;
