import { ApplicationStatus, OfficerReviewStatus, VerificationStatus, VerificationType } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { EmployeeService } from "../src/services/employee.service";
import { presentAdvisoryDiagnostics } from "../src/utils/advisory-diagnostics";
import { presentApplicationReview } from "../src/utils/response-presenters";

const officer = { id: "officer-1", userId: "user-1", isActive: true, user: { id: "user-1", role: "OFFICER", isActive: true } };
const analysis = { analysis: { documentType: "PAN", confidence: 0.8, fields: { fullName: "Secret Name", dateOfBirth: null, address: "Secret Address", documentNumber: "ABCDE1234F", businessName: null, phone: "9999999999", issueDate: null, expiryDate: null }, missingFields: [], detectedIssues: ["Possible mismatch"], signatureDetected: "NOT_AVAILABLE", sealDetected: "NOT_AVAILABLE", isReadable: true, recommendation: "Manual review required" }, ocr: { text: "raw OCR text that must never be returned" } };

describe("employee application review", () => {
  it("exposes only allowlisted advisory diagnostics", () => {
    const diagnostics = presentAdvisoryDiagnostics(analysis);
    expect(diagnostics).toMatchObject({ documentType: "PAN", confidence: 0.8, detectedIssues: ["Possible mismatch"], advisory: expect.stringContaining("never determines") });
    expect(diagnostics).not.toHaveProperty("fields");
    expect(JSON.stringify(diagnostics)).not.toContain("raw OCR text");
    expect(JSON.stringify(diagnostics)).not.toContain("ABCDE1234F");
  });

  it("returns no diagnostics for malformed persisted analysis", () => {
    expect(presentAdvisoryDiagnostics({ analysis: { documentType: "PAN", confidence: 3 } })).toBeNull();
  });

  it("minimizes the detailed review payload while retaining review state", () => {
    const response = presentApplicationReview({
      id: "application-1", applicationNumber: "JSX-1", status: ApplicationStatus.UNDER_REVIEW, reviewStatus: OfficerReviewStatus.IN_REVIEW, correctionReason: null, formData: { serviceChoice: "demo" }, submittedAt: new Date(), createdAt: new Date(), updatedAt: new Date(),
      citizen: { id: "citizen-1", fullName: "Demo Citizen", city: "Pune", state: "Maharashtra" },
      service: { id: "service-1", name: "Demo service", slug: "demo-service", description: "Prototype", isPrototype: true, requirements: [{ id: "requirement-1", name: "PAN", description: "PAN card", isRequired: true, sortOrder: 1 }] },
      assignedOfficer: { id: "officer-1", department: "Revenue", designation: "Officer", user: { displayName: "Review Officer" } }, assignedAt: new Date(), reviewedAt: null,
      applicationDocuments: [{ requirementId: "requirement-1", label: "PAN proof", document: { id: "document-1", documentType: "PAN", expectedDocumentType: "PAN", originalFilename: "proof.pdf", mimeType: "application/pdf", fileSizeBytes: 42, status: "PENDING_VERIFICATION", rejectionReason: null, uploadedAt: new Date(), storageKey: "private/path.pdf", aiExtractionResult: analysis, verifications: [{ id: "verification-1", status: VerificationStatus.MANUAL_REVIEW, failureReason: null, verifiedAt: null, createdAt: new Date(), updatedAt: new Date() }] } }],
      verifications: [{ id: "identity-1", type: VerificationType.PAN, status: VerificationStatus.MANUAL_REVIEW, failureReason: null, verifiedAt: null, createdAt: new Date(), updatedAt: new Date(), result: { raw: "secret" }, providerReference: "private-provider-ref" }],
      statusHistory: [{ status: ApplicationStatus.UNDER_REVIEW, note: "Review started", createdAt: new Date(), changedBy: { displayName: "Review Officer", role: "OFFICER" } }],
    });
    expect(response.assignment).toMatchObject({ officerId: "officer-1", department: "Revenue" });
    expect(response.identityVerifications[0]).toMatchObject({ verificationId: "identity-1", type: VerificationType.PAN, status: VerificationStatus.MANUAL_REVIEW });
    expect(response.documents[0].diagnostics).toHaveProperty("advisory");
    expect(JSON.stringify(response)).not.toContain("private/path.pdf");
    expect(JSON.stringify(response)).not.toContain("raw OCR text");
    expect(JSON.stringify(response)).not.toContain("private-provider-ref");
    expect(JSON.stringify(response)).not.toContain("Secret Address");
  });

  it("denies review detail outside an officer's assignment", async () => {
    const repository: any = { findReviewApplication: async () => ({ assignedOfficerId: "other-officer" }), findOfficerByUserId: async () => officer };
    await expect(new EmployeeService(repository).reviewDetail("user-1", "OFFICER", "application-1")).rejects.toMatchObject({ statusCode: 404 });
  });

  it("delegates identity review without permitting an application decision", async () => {
    let received: unknown;
    const repository: any = {
      findReviewApplication: async () => ({ assignedOfficerId: "officer-1" }),
      findOfficerByUserId: async () => officer,
      reviewIdentityVerification: async (...args: unknown[]) => { received = args; return { id: "identity-1", type: VerificationType.PAN, status: VerificationStatus.VERIFIED, failureReason: null, verifiedAt: new Date(), createdAt: new Date(), updatedAt: new Date() }; },
    };
    const result = await new EmployeeService(repository).reviewIdentityVerification("user-1", "OFFICER", "application-1", "identity-1", "VERIFY", "Identity reviewed by officer");
    expect(result.status).toBe(VerificationStatus.VERIFIED);
    expect(received).toEqual(["application-1", "identity-1", "VERIFY", "Identity reviewed by officer", "user-1"]);
  });
});
