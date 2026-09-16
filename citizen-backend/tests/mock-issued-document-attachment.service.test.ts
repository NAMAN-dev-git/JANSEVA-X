import { randomUUID } from "crypto";
import { ApplicationStatus, type CitizenProfile } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { demoCitizenSeeds } from "../prisma/demo-citizen.seed-data";
import type {
  MockIssuedDocumentAttachmentRecord,
  MockIssuedDocumentAttachmentRepository,
  OwnedApplicationForMockAttachment,
  OwnedMockIssuedDocumentForAttachment,
} from "../src/repositories/mock-issued-document-attachment.repository";
import { MockIssuedDocumentAttachmentService } from "../src/services/mock-issued-document-attachment.service";
import { presentApplicationDetails } from "../src/utils/application-response";
import { attachMockIssuedDocumentRequestSchema } from "../src/validators/mock-issued-document-attachment.validators";

type DemoSeed = (typeof demoCitizenSeeds)[number];
type MemoryDocument = {
  id: string; userId: string; demoCitizenProfileId: string; documentType: string; displayName: string; issuer: string;
  issueDate: Date; expiryDate: Date | null; status: string; isDemo: boolean;
};

class MemoryMockAttachmentRepository implements MockIssuedDocumentAttachmentRepository {
  readonly citizens = new Map<string, CitizenProfile>();
  readonly applications = new Map<string, any>();
  readonly documents = new Map<string, MemoryDocument>();
  readonly attachments = new Map<string, MockIssuedDocumentAttachmentRecord>();

  constructor() {
    for (const demo of demoCitizenSeeds) this.addDemoCitizen(demo);
  }

  private addDemoCitizen(demo: DemoSeed) {
    const userId = randomUUID(); const citizenId = randomUUID(); const demoProfileId = randomUUID();
    const citizen = { id: citizenId, userId, fullName: demo.fullName } as CitizenProfile;
    this.citizens.set(userId, citizen);
    const identityRequirementId = randomUUID();
    const application = {
      id: randomUUID(), citizenId, status: ApplicationStatus.DRAFT,
      service: { requirements: [
        { id: identityRequirementId, name: "Identity Proof" },
        { id: randomUUID(), name: "Property Supporting Document" },
        { id: randomUUID(), name: "PAN Supporting Document" },
        { id: randomUUID(), name: "Address Proof" },
        { id: randomUUID(), name: "Birth Record Supporting Document" },
        { id: randomUUID(), name: "Qualification Certificate" },
      ] },
    };
    this.applications.set(demo.profileCode, application);
    for (const [documentCode, documentType, displayName, issuer, issueDate, expiryDate] of demo.documents) {
      const document: MemoryDocument = { id: randomUUID(), userId, demoCitizenProfileId: demoProfileId, documentType, displayName, issuer, issueDate: new Date(`${issueDate}T00:00:00.000Z`), expiryDate: expiryDate ? new Date(`${expiryDate}T00:00:00.000Z`) : null, status: "AVAILABLE", isDemo: true };
      this.documents.set(documentCode, document);
    }
  }

  userIdFor(profileCode: string) { return [...this.citizens.entries()].find(([, citizen]) => this.applicationFor(profileCode).citizenId === citizen.id)?.[0]!; }
  applicationFor(profileCode: string) { return this.applications.get(profileCode)!; }
  documentFor(profileCode: string, documentType: string) {
    const seed = demoCitizenSeeds.find((item) => item.profileCode === profileCode)!;
    const documentCode = seed.documents.find((item) => item[1] === documentType)?.[0];
    if (!documentCode) throw new Error(`Fixture is missing ${documentType} for ${profileCode}`);
    return this.documents.get(documentCode)!;
  }

  async findCitizenByUserId(userId: string) { return this.citizens.get(userId) ?? null; }
  async findOwnedApplication(applicationId: string, citizenId: string) {
    return [...this.applications.values()].find((application) => application.id === applicationId && application.citizenId === citizenId) as OwnedApplicationForMockAttachment | undefined ?? null;
  }
  async findOwnedMockIssuedDocument(mockIssuedDocumentId: string, userId: string) {
    const document = [...this.documents.values()].find((item) => item.id === mockIssuedDocumentId && item.userId === userId);
    if (!document) return null;
    const citizen = this.citizens.get(userId)!;
    return {
      ...document,
      documentCode: `fixture-${document.id}`,
      structuredFields: null,
      createdAt: new Date(), updatedAt: new Date(),
      demoCitizenProfile: { id: document.demoCitizenProfileId, isDemo: true, citizenProfile: citizen },
    } as unknown as OwnedMockIssuedDocumentForAttachment;
  }
  async upsertAttachment(input: { applicationId: string; mockIssuedDocumentId: string; requirementId: string }) {
    const key = `${input.applicationId}:${input.mockIssuedDocumentId}:${input.requirementId}`;
    const existing = this.attachments.get(key);
    if (existing) return existing;
    const document = [...this.documents.values()].find((item) => item.id === input.mockIssuedDocumentId)!;
    const attachment = { id: randomUUID(), ...input, attachedAt: new Date(), mockIssuedDocument: { ...document, documentCode: `fixture-${document.id}`, structuredFields: null, createdAt: new Date(), updatedAt: new Date() } } as unknown as MockIssuedDocumentAttachmentRecord;
    this.attachments.set(key, attachment);
    return attachment;
  }
}

describe("MockIssuedDocumentAttachmentService", () => {
  it.each(demoCitizenSeeds)("attaches only %s's own Aadhaar and is idempotent", async (demo) => {
    const repository = new MemoryMockAttachmentRepository(); const service = new MockIssuedDocumentAttachmentService(repository);
    const application = repository.applicationFor(demo.profileCode); const identity = application.service.requirements.find((item: { name: string }) => item.name === "Identity Proof")!;
    const aadhaar = repository.documentFor(demo.profileCode, "MOCK_AADHAAR_CARD"); const userId = repository.userIdFor(demo.profileCode);

    const first = await service.attach(userId, application.id, { mockIssuedDocumentId: aadhaar.id, requirementId: identity.id });
    const repeated = await service.attach(userId, application.id, { mockIssuedDocumentId: aadhaar.id, requirementId: identity.id });

    expect(first.attachment.id).toBe(repeated.attachment.id);
    expect(first.attachment.mockIssuedDocument.id).toBe(aadhaar.id);
    expect(repository.attachments.size).toBe(1);
  });

  it("returns the same non-enumerating 404 for a different citizen's document", async () => {
    const repository = new MemoryMockAttachmentRepository(); const service = new MockIssuedDocumentAttachmentService(repository);
    const owner = demoCitizenSeeds[1]; const other = demoCitizenSeeds[0]; const application = repository.applicationFor(owner.profileCode);
    const identity = application.service.requirements.find((item: { name: string }) => item.name === "Identity Proof")!;
    await expect(service.attach(repository.userIdFor(owner.profileCode), application.id, { mockIssuedDocumentId: repository.documentFor(other.profileCode, "MOCK_AADHAAR_CARD").id, requirementId: identity.id })).rejects.toMatchObject({ statusCode: 404, message: "Issued demo document not found" });
  });

  it("rejects mismatched and invalid requirements without creating an attachment", async () => {
    const repository = new MemoryMockAttachmentRepository(); const service = new MockIssuedDocumentAttachmentService(repository); const demo = demoCitizenSeeds[0];
    const application = repository.applicationFor(demo.profileCode); const userId = repository.userIdFor(demo.profileCode);
    const identity = application.service.requirements.find((item: { name: string }) => item.name === "Identity Proof")!;
    await expect(service.attach(userId, application.id, { mockIssuedDocumentId: repository.documentFor(demo.profileCode, "MOCK_PAN_CARD").id, requirementId: identity.id })).rejects.toMatchObject({ statusCode: 400 });
    await expect(service.attach(userId, application.id, { mockIssuedDocumentId: repository.documentFor(demo.profileCode, "MOCK_AADHAAR_CARD").id, requirementId: randomUUID() })).rejects.toMatchObject({ statusCode: 400 });
    expect(repository.attachments.size).toBe(0);
  });

  it("rejects non-draft, expired, and unavailable documents", async () => {
    const repository = new MemoryMockAttachmentRepository(); const service = new MockIssuedDocumentAttachmentService(repository); const demo = demoCitizenSeeds[0];
    const application = repository.applicationFor(demo.profileCode); const userId = repository.userIdFor(demo.profileCode); const identity = application.service.requirements.find((item: { name: string }) => item.name === "Identity Proof")!; const aadhaar = repository.documentFor(demo.profileCode, "MOCK_AADHAAR_CARD");
    application.status = ApplicationStatus.IDENTITY_VERIFIED;
    await expect(service.attach(userId, application.id, { mockIssuedDocumentId: aadhaar.id, requirementId: identity.id })).rejects.toMatchObject({ statusCode: 409 });
    application.status = ApplicationStatus.DRAFT; aadhaar.expiryDate = new Date("2000-01-01T00:00:00.000Z");
    await expect(service.attach(userId, application.id, { mockIssuedDocumentId: aadhaar.id, requirementId: identity.id })).rejects.toMatchObject({ statusCode: 409, message: "Issued demo document has expired" });
    aadhaar.expiryDate = null; aadhaar.status = "REVOKED";
    await expect(service.attach(userId, application.id, { mockIssuedDocumentId: aadhaar.id, requirementId: identity.id })).rejects.toMatchObject({ statusCode: 409, message: "Issued demo document is not available for attachment" });
  });

  it("projects mock issued attachments separately from uploaded documents", async () => {
    const repository = new MemoryMockAttachmentRepository(); const service = new MockIssuedDocumentAttachmentService(repository); const demo = demoCitizenSeeds[0];
    const application = repository.applicationFor(demo.profileCode); const identity = application.service.requirements.find((item: { name: string }) => item.name === "Identity Proof")!;
    const attached = await service.attach(repository.userIdFor(demo.profileCode), application.id, { mockIssuedDocumentId: repository.documentFor(demo.profileCode, "MOCK_AADHAAR_CARD").id, requirementId: identity.id });
    const response = presentApplicationDetails({ id: application.id, applicationNumber: "JX-TEST", status: ApplicationStatus.DRAFT, formData: {}, createdAt: new Date(), updatedAt: new Date(), submittedAt: null, statusHistory: [], applicationDocuments: [], mockIssuedDocumentAttachments: [attached.attachment], generatedDocuments: [], service: { id: randomUUID(), name: "Property Documents", slug: "property-documents", description: null, isActive: true, isPrototype: true, requirements: application.service.requirements } } as any);
    expect(response.documents).toHaveLength(0);
    expect(response.mockIssuedDocumentAttachments).toEqual([expect.objectContaining({ requirementId: identity.id, requirementName: "Identity Proof", source: "MOCK_ISSUED_DOCUMENT", mockIssuedDocument: expect.objectContaining({ isDemo: true, mode: "DEMO/PROTOTYPE" }) })]);
  });

  it("validates the attachment request body strictly", () => {
    expect(attachMockIssuedDocumentRequestSchema.safeParse({ body: { mockIssuedDocumentId: randomUUID(), requirementId: randomUUID() }, params: { applicationId: randomUUID() }, query: {} }).success).toBe(true);
    expect(attachMockIssuedDocumentRequestSchema.safeParse({ body: { mockIssuedDocumentId: randomUUID(), requirementId: randomUUID(), citizenId: randomUUID() }, params: { applicationId: randomUUID() }, query: {} }).success).toBe(false);
  });
});
