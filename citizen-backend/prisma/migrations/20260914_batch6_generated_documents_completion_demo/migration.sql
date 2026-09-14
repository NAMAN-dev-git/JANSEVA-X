-- Batch 6 generated-document and mock e-sign completion demo. This migration
-- is additive and deliberately preserves the legacy VARCHAR signature_status.
-- It never coerces historical values.

CREATE TYPE "GeneratedDocumentSigningSessionStatus" AS ENUM ('PENDING', 'COMPLETED', 'EXPIRED');

ALTER TABLE "generated_documents"
  ADD COLUMN IF NOT EXISTS "original_filename" VARCHAR(500),
  ADD COLUMN IF NOT EXISTS "file_size_bytes" INTEGER,
  ADD COLUMN IF NOT EXISTS "sha256" CHAR(64),
  ADD COLUMN IF NOT EXISTS "template_version" VARCHAR(100),
  ADD COLUMN IF NOT EXISTS "generated_by_user_id" UUID,
  ADD COLUMN IF NOT EXISTS "issuance_key" CHAR(64);

ALTER TABLE "generated_documents"
  ADD CONSTRAINT "generated_documents_generated_by_user_id_fkey"
  FOREIGN KEY ("generated_by_user_id") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS "generated_documents_issuance_key_key"
  ON "generated_documents" ("issuance_key");

-- NOT VALID protects new writes while allowing unknown historical values to be
-- inspected and remediated without a destructive or silent conversion.
ALTER TABLE "generated_documents"
  ADD CONSTRAINT "generated_documents_signature_status_check"
  CHECK ("signature_status" IN ('NOT_SIGNED', 'SIGNED')) NOT VALID;

CREATE TABLE "generated_document_signing_sessions" (
  "generated_document_signing_session_id" UUID NOT NULL,
  "generated_document_id" UUID NOT NULL,
  "citizen_id" UUID NOT NULL,
  "consent_id" UUID,
  "status" "GeneratedDocumentSigningSessionStatus" NOT NULL DEFAULT 'PENDING',
  "provider_reference" VARCHAR(255) NOT NULL,
  "signing_challenge_hash" CHAR(64) NOT NULL,
  "document_sha256" CHAR(64) NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "generated_document_signing_sessions_pkey" PRIMARY KEY ("generated_document_signing_session_id"),
  CONSTRAINT "generated_document_signing_sessions_consent_id_key" UNIQUE ("consent_id"),
  CONSTRAINT "generated_document_signing_sessions_generated_document_id_fkey" FOREIGN KEY ("generated_document_id") REFERENCES "generated_documents"("generated_document_id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "generated_document_signing_sessions_citizen_id_fkey" FOREIGN KEY ("citizen_id") REFERENCES "citizen_profiles"("citizen_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "generated_document_signing_sessions_consent_id_fkey" FOREIGN KEY ("consent_id") REFERENCES "consents"("consent_id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "generated_document_signing_sessions_generated_document_id_status_idx"
  ON "generated_document_signing_sessions" ("generated_document_id", "status");
CREATE INDEX "generated_document_signing_sessions_citizen_id_expires_at_idx"
  ON "generated_document_signing_sessions" ("citizen_id", "expires_at");
CREATE UNIQUE INDEX "generated_document_signing_sessions_one_pending_per_document_key"
  ON "generated_document_signing_sessions" ("generated_document_id")
  WHERE "status" = 'PENDING';
