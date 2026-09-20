-- CreateTable
CREATE TABLE "application_mock_issued_documents" (
    "application_mock_issued_document_id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "mock_issued_document_id" UUID NOT NULL,
    "requirement_id" UUID NOT NULL,
    "attached_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "application_mock_issued_documents_pkey" PRIMARY KEY ("application_mock_issued_document_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "application_mock_issued_documents_application_id_mock_issued_document_id_requirement_id_key"
ON "application_mock_issued_documents"("application_id", "mock_issued_document_id", "requirement_id");

-- CreateIndex
CREATE INDEX "application_mock_issued_documents_application_id_idx"
ON "application_mock_issued_documents"("application_id");

-- AddForeignKey
ALTER TABLE "application_mock_issued_documents"
ADD CONSTRAINT "application_mock_issued_documents_application_id_fkey"
FOREIGN KEY ("application_id") REFERENCES "applications"("application_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_mock_issued_documents"
ADD CONSTRAINT "application_mock_issued_documents_mock_issued_document_id_fkey"
FOREIGN KEY ("mock_issued_document_id") REFERENCES "mock_issued_documents"("mock_issued_document_id") ON DELETE RESTRICT ON UPDATE CASCADE;
