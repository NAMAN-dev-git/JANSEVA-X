import { randomUUID } from "crypto";

export const GENERATED_DOCUMENT_DEMO_MODE = "DEMO/PROTOTYPE";

export class MockGeneratedDocumentIssuer {
  createReference(applicationId: string): string {
    return `DEMO-ISSUANCE-${applicationId.slice(0, 8).toUpperCase()}-${randomUUID().slice(0, 8).toUpperCase()}`;
  }
}

export class MockEsignProvider {
  createSessionReference(generatedDocumentId: string): string {
    return `DEMO-ESIGN-${generatedDocumentId.slice(0, 8).toUpperCase()}-${randomUUID().slice(0, 8).toUpperCase()}`;
  }

  complete(sessionId: string): string {
    return `DEMO-ESIGN-COMPLETED-${sessionId.slice(0, 8).toUpperCase()}`;
  }
}
