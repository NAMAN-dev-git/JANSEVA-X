-- Additive durable binary storage for Vercel-hosted citizen uploads and
-- generated demo documents. No existing document metadata or rows are changed.
CREATE TABLE "stored_files" (
  "stored_file_id" UUID NOT NULL,
  "storage_key" VARCHAR(1000) NOT NULL,
  "contents" BYTEA NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "stored_files_pkey" PRIMARY KEY ("stored_file_id")
);

CREATE UNIQUE INDEX "stored_files_storage_key_key" ON "stored_files"("storage_key");
