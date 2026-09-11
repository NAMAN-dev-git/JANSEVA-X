-- Batch 4 hardening: additive/non-destructive migration.
-- Review note: this migration refuses to invent SHA-256 values for pre-existing files.
-- If legacy documents exist without their source bytes, stop and resolve them before applying.

ALTER TYPE "VerificationType" ADD VALUE IF NOT EXISTS 'DOCUMENT';

ALTER TABLE "documents"
  ADD COLUMN IF NOT EXISTS "sha256" CHAR(64),
  ADD COLUMN IF NOT EXISTS "expected_document_type" VARCHAR(150);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "documents" WHERE "sha256" IS NULL) THEN
    RAISE EXCEPTION 'Batch 4 migration stopped: existing documents require their real SHA-256 values before sha256 can be made mandatory.';
  END IF;
END $$;

ALTER TABLE "documents"
  ALTER COLUMN "sha256" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "verifications_document_id_type_key"
  ON "verifications" ("document_id", "type");
