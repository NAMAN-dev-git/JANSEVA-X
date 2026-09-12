-- Reconstructed Batch 1–3 baseline for a fresh database. This is deliberately
-- the schema immediately before Batch 4: it excludes DOCUMENT verification,
-- document SHA-256/expected type fields, and every Batch 5 object.

CREATE TYPE "UserRole" AS ENUM ('CITIZEN', 'OFFICER', 'ADMIN');
CREATE TYPE "ApplicationStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'IDENTITY_VERIFIED', 'DOCUMENTS_VERIFIED', 'UNDER_REVIEW', 'CORRECTION_REQUIRED', 'APPROVED', 'REJECTED', 'SIGNED', 'COMPLETED');
CREATE TYPE "DocumentStatus" AS ENUM ('UPLOADED', 'PENDING_VERIFICATION', 'VERIFIED', 'REJECTED', 'CORRECTION_REQUIRED');
CREATE TYPE "VerificationType" AS ENUM ('AADHAAR', 'PAN', 'FACE', 'FINGERPRINT', 'E_KYC');
CREATE TYPE "VerificationStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'VERIFIED', 'FAILED', 'MANUAL_REVIEW');
CREATE TYPE "ConsentStatus" AS ENUM ('GRANTED', 'DECLINED', 'REVOKED');
CREATE TYPE "NotificationType" AS ENUM ('APPLICATION_UPDATE', 'DOCUMENT_UPDATE', 'VERIFICATION_UPDATE', 'SYSTEM');
CREATE TYPE "AIMessageRole" AS ENUM ('CITIZEN', 'ASSISTANT', 'SYSTEM');
CREATE TYPE "OfficerReviewStatus" AS ENUM ('NOT_ASSIGNED', 'ASSIGNED', 'IN_REVIEW', 'REVIEWED');

CREATE TABLE "users" (
  "user_id" UUID NOT NULL,
  "email" VARCHAR(320) NOT NULL,
  "password_hash" TEXT NOT NULL,
  "role" "UserRole" NOT NULL DEFAULT 'CITIZEN',
  "display_name" VARCHAR(150),
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "last_login_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "users_pkey" PRIMARY KEY ("user_id")
);

CREATE TABLE "citizen_profiles" (
  "citizen_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "full_name" VARCHAR(200) NOT NULL,
  "mobile_number" VARCHAR(30),
  "date_of_birth" DATE,
  "address" VARCHAR(500),
  "city" VARCHAR(100),
  "state" VARCHAR(100),
  "pincode" VARCHAR(20),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "citizen_profiles_pkey" PRIMARY KEY ("citizen_id"),
  CONSTRAINT "citizen_profiles_user_id_key" UNIQUE ("user_id"),
  CONSTRAINT "citizen_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "refresh_tokens" (
  "refresh_token_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "token_hash" CHAR(64) NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "revoked_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("refresh_token_id"),
  CONSTRAINT "refresh_tokens_token_hash_key" UNIQUE ("token_hash"),
  CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "officers" (
  "officer_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "employee_identifier" VARCHAR(100) NOT NULL,
  "department" VARCHAR(150) NOT NULL,
  "designation" VARCHAR(150) NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "officers_pkey" PRIMARY KEY ("officer_id"),
  CONSTRAINT "officers_user_id_key" UNIQUE ("user_id"),
  CONSTRAINT "officers_employee_identifier_key" UNIQUE ("employee_identifier"),
  CONSTRAINT "officers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "government_services" (
  "service_id" UUID NOT NULL,
  "name" VARCHAR(200) NOT NULL,
  "slug" VARCHAR(100) NOT NULL,
  "description" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "is_prototype" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "government_services_pkey" PRIMARY KEY ("service_id"),
  CONSTRAINT "government_services_slug_key" UNIQUE ("slug")
);

CREATE TABLE "service_requirements" (
  "service_requirement_id" UUID NOT NULL,
  "service_id" UUID NOT NULL,
  "name" VARCHAR(200) NOT NULL,
  "description" TEXT,
  "is_required" BOOLEAN NOT NULL DEFAULT true,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "service_requirements_pkey" PRIMARY KEY ("service_requirement_id"),
  CONSTRAINT "service_requirements_service_id_name_key" UNIQUE ("service_id", "name"),
  CONSTRAINT "service_requirements_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "government_services"("service_id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "applications" (
  "application_id" UUID NOT NULL,
  "citizen_id" UUID NOT NULL,
  "service_id" UUID NOT NULL,
  "application_number" VARCHAR(100) NOT NULL,
  "status" "ApplicationStatus" NOT NULL DEFAULT 'DRAFT',
  "form_data" JSONB,
  "correction_reason" TEXT,
  "assigned_officer_id" UUID,
  "review_status" "OfficerReviewStatus" NOT NULL DEFAULT 'NOT_ASSIGNED',
  "assigned_at" TIMESTAMP(3),
  "reviewed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "submitted_at" TIMESTAMP(3),
  CONSTRAINT "applications_pkey" PRIMARY KEY ("application_id"),
  CONSTRAINT "applications_application_number_key" UNIQUE ("application_number"),
  CONSTRAINT "applications_citizen_id_fkey" FOREIGN KEY ("citizen_id") REFERENCES "citizen_profiles"("citizen_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "applications_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "government_services"("service_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "applications_assigned_officer_id_fkey" FOREIGN KEY ("assigned_officer_id") REFERENCES "officers"("officer_id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "documents" (
  "document_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "document_type" VARCHAR(150) NOT NULL,
  "original_filename" VARCHAR(500) NOT NULL,
  "storage_key" VARCHAR(1000) NOT NULL,
  "mime_type" VARCHAR(150) NOT NULL,
  "file_size_bytes" INTEGER NOT NULL,
  "status" "DocumentStatus" NOT NULL DEFAULT 'UPLOADED',
  "ai_extraction_result" JSONB,
  "rejection_reason" TEXT,
  "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "documents_pkey" PRIMARY KEY ("document_id"),
  CONSTRAINT "documents_storage_key_key" UNIQUE ("storage_key"),
  CONSTRAINT "documents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "application_documents" (
  "application_document_id" UUID NOT NULL,
  "application_id" UUID NOT NULL,
  "document_id" UUID NOT NULL,
  "requirement_id" UUID,
  "label" VARCHAR(200),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "application_documents_pkey" PRIMARY KEY ("application_document_id"),
  CONSTRAINT "application_documents_application_id_document_id_key" UNIQUE ("application_id", "document_id"),
  CONSTRAINT "application_documents_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("application_id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "application_documents_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("document_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "verifications" (
  "verification_id" UUID NOT NULL,
  "application_id" UUID NOT NULL,
  "citizen_id" UUID NOT NULL,
  "document_id" UUID,
  "type" "VerificationType" NOT NULL,
  "status" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
  "provider_reference" VARCHAR(255),
  "result" JSONB,
  "failure_reason" TEXT,
  "verified_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "verifications_pkey" PRIMARY KEY ("verification_id"),
  CONSTRAINT "verifications_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("application_id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "verifications_citizen_id_fkey" FOREIGN KEY ("citizen_id") REFERENCES "citizen_profiles"("citizen_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "verifications_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("document_id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "consents" (
  "consent_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "citizen_id" UUID NOT NULL,
  "application_id" UUID NOT NULL,
  "consent_type" VARCHAR(150) NOT NULL,
  "consent_text" TEXT NOT NULL,
  "consent_version" VARCHAR(50) NOT NULL,
  "status" "ConsentStatus" NOT NULL DEFAULT 'GRANTED',
  "ip_address" VARCHAR(64),
  "device_metadata" JSONB,
  "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revoked_at" TIMESTAMP(3),
  CONSTRAINT "consents_pkey" PRIMARY KEY ("consent_id"),
  CONSTRAINT "consents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "consents_citizen_id_fkey" FOREIGN KEY ("citizen_id") REFERENCES "citizen_profiles"("citizen_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "consents_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("application_id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "ai_conversations" (
  "conversation_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "citizen_id" UUID,
  "application_id" UUID,
  "title" VARCHAR(255),
  "context" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ai_conversations_pkey" PRIMARY KEY ("conversation_id"),
  CONSTRAINT "ai_conversations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ai_conversations_citizen_id_fkey" FOREIGN KEY ("citizen_id") REFERENCES "citizen_profiles"("citizen_id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ai_conversations_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("application_id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "ai_messages" (
  "message_id" UUID NOT NULL,
  "conversation_id" UUID NOT NULL,
  "role" "AIMessageRole" NOT NULL,
  "content" TEXT NOT NULL,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_messages_pkey" PRIMARY KEY ("message_id"),
  CONSTRAINT "ai_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "ai_conversations"("conversation_id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "application_status_history" (
  "status_history_id" UUID NOT NULL,
  "application_id" UUID NOT NULL,
  "status" "ApplicationStatus" NOT NULL,
  "note" TEXT,
  "changed_by_user_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "application_status_history_pkey" PRIMARY KEY ("status_history_id"),
  CONSTRAINT "application_status_history_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("application_id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "application_status_history_changed_by_user_id_fkey" FOREIGN KEY ("changed_by_user_id") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "generated_documents" (
  "generated_document_id" UUID NOT NULL,
  "application_id" UUID NOT NULL,
  "document_type" VARCHAR(150) NOT NULL,
  "storage_key" VARCHAR(1000) NOT NULL,
  "mime_type" VARCHAR(150) NOT NULL,
  "signature_status" VARCHAR(50) NOT NULL DEFAULT 'NOT_SIGNED',
  "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "signed_at" TIMESTAMP(3),
  CONSTRAINT "generated_documents_pkey" PRIMARY KEY ("generated_document_id"),
  CONSTRAINT "generated_documents_storage_key_key" UNIQUE ("storage_key"),
  CONSTRAINT "generated_documents_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("application_id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "notifications" (
  "notification_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "application_id" UUID,
  "type" "NotificationType" NOT NULL,
  "title" VARCHAR(255) NOT NULL,
  "message" TEXT NOT NULL,
  "is_read" BOOLEAN NOT NULL DEFAULT false,
  "read_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notifications_pkey" PRIMARY KEY ("notification_id"),
  CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "notifications_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("application_id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "users_role_idx" ON "users"("role");
CREATE INDEX "users_created_at_idx" ON "users"("created_at");
CREATE INDEX "citizen_profiles_created_at_idx" ON "citizen_profiles"("created_at");
CREATE INDEX "refresh_tokens_user_id_expires_at_idx" ON "refresh_tokens"("user_id", "expires_at");
CREATE INDEX "refresh_tokens_expires_at_idx" ON "refresh_tokens"("expires_at");
CREATE INDEX "officers_department_idx" ON "officers"("department");
CREATE INDEX "government_services_is_active_idx" ON "government_services"("is_active");
CREATE INDEX "government_services_created_at_idx" ON "government_services"("created_at");
CREATE INDEX "service_requirements_service_id_sort_order_idx" ON "service_requirements"("service_id", "sort_order");
CREATE INDEX "applications_citizen_id_created_at_idx" ON "applications"("citizen_id", "created_at");
CREATE INDEX "applications_service_id_status_idx" ON "applications"("service_id", "status");
CREATE INDEX "applications_status_created_at_idx" ON "applications"("status", "created_at");
CREATE INDEX "applications_assigned_officer_id_review_status_idx" ON "applications"("assigned_officer_id", "review_status");
CREATE INDEX "documents_user_id_uploaded_at_idx" ON "documents"("user_id", "uploaded_at");
CREATE INDEX "documents_status_idx" ON "documents"("status");
CREATE INDEX "application_documents_document_id_idx" ON "application_documents"("document_id");
CREATE INDEX "application_documents_application_id_idx" ON "application_documents"("application_id");
CREATE INDEX "verifications_application_id_status_idx" ON "verifications"("application_id", "status");
CREATE INDEX "verifications_citizen_id_type_idx" ON "verifications"("citizen_id", "type");
CREATE INDEX "verifications_document_id_idx" ON "verifications"("document_id");
CREATE INDEX "consents_application_id_status_idx" ON "consents"("application_id", "status");
CREATE INDEX "consents_citizen_id_recorded_at_idx" ON "consents"("citizen_id", "recorded_at");
CREATE INDEX "ai_conversations_user_id_created_at_idx" ON "ai_conversations"("user_id", "created_at");
CREATE INDEX "ai_conversations_citizen_id_idx" ON "ai_conversations"("citizen_id");
CREATE INDEX "ai_conversations_application_id_idx" ON "ai_conversations"("application_id");
CREATE INDEX "ai_messages_conversation_id_created_at_idx" ON "ai_messages"("conversation_id", "created_at");
CREATE INDEX "application_status_history_application_id_created_at_idx" ON "application_status_history"("application_id", "created_at");
CREATE INDEX "application_status_history_status_idx" ON "application_status_history"("status");
CREATE INDEX "generated_documents_application_id_generated_at_idx" ON "generated_documents"("application_id", "generated_at");
CREATE INDEX "notifications_user_id_is_read_created_at_idx" ON "notifications"("user_id", "is_read", "created_at");
CREATE INDEX "notifications_application_id_idx" ON "notifications"("application_id");
