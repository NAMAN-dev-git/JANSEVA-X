import { ApplicationStatus, OfficerReviewStatus, VerificationStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { EmployeeService } from "../src/services/employee.service";
import { presentApplicationReview } from "../src/utils/response-presenters";
import { decisionSchema } from "../src/validators/employee.validators";

const officer = { id: "officer-1", userId: "user-1", isActive: true, user: { id: "user-1", role: "OFFICER", isActive: true } };
const application = { id: "application-1", status: ApplicationStatus.IDENTITY_VERIFIED, assignedOfficerId: null, reviewStatus: OfficerReviewStatus.NOT_ASSIGNED };

describe("Batch 4 citizen and employee integration", () => {
  it("requires citizen submission before claim and review can begin", async () => {
    const repository: any = {
      findOfficerByUserId: async () => officer,
      claim: async () => application.status === ApplicationStatus.SUBMITTED ? { ...application, assignedOfficerId: officer.id, reviewStatus: OfficerReviewStatus.ASSIGNED } : null,
      startReview: async () => application.status === ApplicationStatus.SUBMITTED ? { ...application, status: ApplicationStatus.UNDER_REVIEW, reviewStatus: OfficerReviewStatus.IN_REVIEW, assignedOfficerId: officer.id } : null,
    };
    const service = new EmployeeService(repository);
    await expect(service.claimApplication("user-1", application.id)).rejects.toMatchObject({ statusCode: 409 });
    application.status = ApplicationStatus.SUBMITTED;
    await expect(service.claimApplication("user-1", application.id)).resolves.toMatchObject({ reviewStatus: OfficerReviewStatus.ASSIGNED });
    await expect(service.start("user-1", "OFFICER", application.id)).resolves.toMatchObject({ status: ApplicationStatus.UNDER_REVIEW });
  });

  it("prevents admin assignment of draft and identity-verified applications", async () => {
    const repository: any = { assign: async () => "NOT_REVIEWABLE" as const };
    const service = new EmployeeService(repository);
    await expect(service.assign("admin-1", "draft-application", officer.id)).rejects.toMatchObject({ statusCode: 409 });
    await expect(service.assign("admin-1", "identity-verified-application", officer.id)).rejects.toMatchObject({ statusCode: 409 });
  });

  it("allows only human review decisions and rejects direct signed or completed states", async () => {
    expect(decisionSchema.safeParse({ body: { status: "SIGNED", note: "Attempted signing shortcut" }, params: { applicationId: "00000000-0000-4000-8000-000000000001" }, query: {} }).success).toBe(false);
    expect(decisionSchema.safeParse({ body: { status: "COMPLETED", note: "Attempted completion shortcut" }, params: { applicationId: "00000000-0000-4000-8000-000000000001" }, query: {} }).success).toBe(false);
    const repository: any = { findApplication: async () => ({ id: application.id, status: ApplicationStatus.UNDER_REVIEW, assignedOfficerId: officer.id }), findOfficerByUserId: async () => officer };
    const service = new EmployeeService(repository);
    await expect(service.decision("user-1", "OFFICER", application.id, ApplicationStatus.SIGNED, "Attempted signing shortcut")).rejects.toMatchObject({ statusCode: 409 });
    await expect(service.decision("user-1", "OFFICER", application.id, ApplicationStatus.COMPLETED, "Attempted completion shortcut")).rejects.toMatchObject({ statusCode: 409 });
  });

  it("records each permitted officer decision from an application under review", async () => {
    for (const status of [ApplicationStatus.APPROVED, ApplicationStatus.CORRECTION_REQUIRED, ApplicationStatus.REJECTED]) {
      let received: unknown;
      const repository: any = { findApplication: async () => ({ id: application.id, status: ApplicationStatus.UNDER_REVIEW, assignedOfficerId: officer.id }), findOfficerByUserId: async () => officer, decide: async (...args: unknown[]) => { received = args; return { id: application.id, status }; } };
      await expect(new EmployeeService(repository).decision("user-1", "OFFICER", application.id, status, "Officer decision recorded")).resolves.toMatchObject({ status });
      expect(received).toEqual([application.id, status, "Officer decision recorded", "user-1", officer.id]);
    }
  });

  it("uses the canonical citizen backend issuer only after approval", async () => {
    let received: unknown;
    const repository: any = { findApplication: async () => ({ id: application.id, status: ApplicationStatus.APPROVED, assignedOfficerId: officer.id }), findOfficerByUserId: async () => officer };
    const issuer = { issue: async (...args: unknown[]) => { received = args; return { generatedDocumentId: "generated-1", applicationId: application.id, documentType: "COMPLETION_CERTIFICATE", originalFilename: "demo.pdf", mimeType: "application/pdf", fileSizeBytes: 42, signatureStatus: "NOT_SIGNED", generatedAt: "2026-09-16T00:00:00.000Z", signedAt: null, mode: "DEMO/PROTOTYPE", disclaimer: "Mock document" }; } };
    const service = new EmployeeService(repository, issuer);
    await expect(service.issueGeneratedDocument("user-1", "OFFICER", application.id, "Bearer employee-token")).resolves.toMatchObject({ generatedDocumentId: "generated-1" });
    expect(received).toEqual([application.id, "Bearer employee-token"]);
  });

  it("does not treat a mock-issued document ID as an uploaded document", async () => {
    const service = new EmployeeService({ documentApplication: async () => null } as any);
    await expect(service.reviewDocument("admin-1", "ADMIN", "00000000-0000-4000-8000-000000000111", "VERIFY", "Reviewed as an upload")).rejects.toMatchObject({ statusCode: 404 });
  });

  it("projects allowlisted mock-issued and generated-document state separately", () => {
    const response = presentApplicationReview({
      id: application.id, applicationNumber: "JX-DEMO-1", status: ApplicationStatus.UNDER_REVIEW, reviewStatus: OfficerReviewStatus.IN_REVIEW, correctionReason: null, formData: {}, submittedAt: new Date(), createdAt: new Date(), updatedAt: new Date(),
      citizen: { id: "citizen-1", fullName: "Demo Citizen", city: "Demo City", state: "Demo State" },
      service: { id: "service-1", name: "Property Documents", slug: "property-documents", description: "Demo", isPrototype: true, requirements: [{ id: "requirement-1", name: "Identity Proof", description: "Demo", isRequired: true, sortOrder: 1 }] },
      assignedOfficer: null, applicationDocuments: [], verifications: [], statusHistory: [],
      mockIssuedDocumentAttachments: [{ id: "attachment-1", requirementId: "requirement-1", attachedAt: new Date(), mockIssuedDocument: { id: "mock-document-1", documentType: "MOCK_AADHAAR_CARD", displayName: "Mock Aadhaar Card", issuer: "JANSEVA-X Demo Identity Registry", issueDate: new Date(), expiryDate: null, status: "AVAILABLE", isDemo: true, structuredFields: { holderName: "must-not-leak" }, demoCitizenProfileId: "must-not-leak" } }],
      generatedDocuments: [{ id: "generated-1", documentType: "COMPLETION_CERTIFICATE", originalFilename: "demo.pdf", signatureStatus: "SIGNED", generatedAt: new Date(), signedAt: new Date(), storageKey: "must-not-leak", sha256: "must-not-leak", signingSessions: [{ status: "COMPLETED", expiresAt: new Date(), completedAt: new Date(), signingChallengeHash: "must-not-leak" }] }],
    } as any);
    expect(response.documents).toEqual([]);
    expect(response.mockIssuedDocumentAttachments[0]).toMatchObject({ attachmentId: "attachment-1", requirementName: "Identity Proof", source: "MOCK_ISSUED_DOCUMENT", mockIssuedDocument: { documentId: "mock-document-1", isDemo: true, mode: "DEMO/PROTOTYPE" } });
    expect(response.generatedDocuments[0]).toMatchObject({ generatedDocumentId: "generated-1", signatureStatus: "SIGNED", signingSession: { state: "COMPLETED" } });
    expect(JSON.stringify(response)).not.toContain("must-not-leak");
  });

  it("retains the existing uploaded-document review path", async () => {
    const document = { id: "document-1", applicationLinks: [{ applicationId: application.id, application: { citizenId: "citizen-1" } }], verifications: [{ id: "verification-1", status: VerificationStatus.VERIFIED, failureReason: null, verifiedAt: new Date() }] };
    const repository: any = { documentApplication: async () => ({ id: application.id, assignedOfficerId: officer.id }), findOfficerByUserId: async () => officer, reviewDocument: async () => document };
    await expect(new EmployeeService(repository).reviewDocument("user-1", "OFFICER", document.id, "VERIFY", "Uploaded document reviewed")).resolves.toBe(document);
  });
});
