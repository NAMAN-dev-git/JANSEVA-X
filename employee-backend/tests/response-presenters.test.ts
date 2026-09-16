import { describe, expect, it } from "vitest";
import { presentDocument } from "../src/utils/response-presenters";

describe("employee response minimization", () => {
  it("does not expose document storage keys or raw OCR analysis", () => {
    const response = presentDocument({ id: "document-1", storageKey: "private/path.pdf", aiExtractionResult: { ocr: { text: "sensitive text" } }, documentType: "PAN", expectedDocumentType: "PAN", originalFilename: "proof.pdf", mimeType: "application/pdf", fileSizeBytes: 42, status: "PENDING_VERIFICATION", rejectionReason: null, uploadedAt: new Date(), applicationLinks: [{ applicationId: "application-1" }], verifications: [] });
    expect(response).not.toHaveProperty("storageKey");
    expect(response).not.toHaveProperty("aiExtractionResult");
    expect(JSON.stringify(response)).not.toContain("sensitive text");
  });
});
