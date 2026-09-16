-- Demo-only citizen registry. This is intentionally separate from uploaded
-- documents and completion documents so their existing lifecycles are unchanged.
CREATE TABLE "demo_citizen_profiles" (
    "demo_citizen_profile_id" UUID NOT NULL,
    "profile_code" VARCHAR(50) NOT NULL,
    "normalized_mobile" VARCHAR(15) NOT NULL,
    "mock_otp_hash" TEXT NOT NULL,
    "citizen_profile_id" UUID NOT NULL,
    "is_demo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "demo_citizen_profiles_pkey" PRIMARY KEY ("demo_citizen_profile_id")
);

CREATE TABLE "mock_issued_documents" (
    "mock_issued_document_id" UUID NOT NULL,
    "document_code" VARCHAR(100) NOT NULL,
    "demo_citizen_profile_id" UUID NOT NULL,
    "document_type" VARCHAR(150) NOT NULL,
    "display_name" VARCHAR(200) NOT NULL,
    "issuer" VARCHAR(200) NOT NULL,
    "issue_date" DATE NOT NULL,
    "expiry_date" DATE,
    "status" VARCHAR(50) NOT NULL DEFAULT 'AVAILABLE',
    "structured_fields" JSONB,
    "is_demo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mock_issued_documents_pkey" PRIMARY KEY ("mock_issued_document_id")
);

CREATE UNIQUE INDEX "demo_citizen_profiles_profile_code_key" ON "demo_citizen_profiles"("profile_code");
CREATE UNIQUE INDEX "demo_citizen_profiles_normalized_mobile_key" ON "demo_citizen_profiles"("normalized_mobile");
CREATE UNIQUE INDEX "demo_citizen_profiles_citizen_profile_id_key" ON "demo_citizen_profiles"("citizen_profile_id");
CREATE INDEX "demo_citizen_profiles_created_at_idx" ON "demo_citizen_profiles"("created_at");
CREATE UNIQUE INDEX "mock_issued_documents_document_code_key" ON "mock_issued_documents"("document_code");
CREATE INDEX "mock_issued_documents_demo_citizen_profile_id_status_idx" ON "mock_issued_documents"("demo_citizen_profile_id", "status");
CREATE INDEX "mock_issued_documents_document_type_idx" ON "mock_issued_documents"("document_type");

ALTER TABLE "demo_citizen_profiles"
ADD CONSTRAINT "demo_citizen_profiles_citizen_profile_id_fkey"
FOREIGN KEY ("citizen_profile_id") REFERENCES "citizen_profiles"("citizen_id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "mock_issued_documents"
ADD CONSTRAINT "mock_issued_documents_demo_citizen_profile_id_fkey"
FOREIGN KEY ("demo_citizen_profile_id") REFERENCES "demo_citizen_profiles"("demo_citizen_profile_id")
ON DELETE CASCADE ON UPDATE CASCADE;
