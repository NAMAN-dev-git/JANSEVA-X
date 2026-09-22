import { createHash, randomUUID } from "crypto";
import { readFile } from "fs/promises";
import { ApplicationStatus, DocumentStatus, VerificationStatus, type CitizenProfile } from "@prisma/client";
import express, { type Express } from "express";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { documentUpload } from "../src/middleware/document-upload";
import { AppError } from "../src/utils/app-error";
import type { DocumentRepository, OwnedApplicationForDocuments, OwnedDocument } from "../src/repositories/document.repository";
import { documentAnalysisSchema, DeterministicDocumentAnalysisProvider, type DocumentAnalysisProvider } from "../src/services/document-analysis.service";
import { DocumentService } from "../src/services/document.service";
import { TesseractOcrProvider, type OcrProvider } from "../src/services/ocr.service";
import { StorageService } from "../src/services/storage/storage.service";
import type { StorageProvider } from "../src/services/storage/storage.provider";
import { documentIdParamsSchema } from "../src/validators/document.validators";

class MemoryStorageProvider implements StorageProvider {
  readonly contents = new Map<string, Buffer>();
  async store(input: { contents: Buffer; extension: string }) { const storageKey = `${randomUUID()}${input.extension}`; this.contents.set(storageKey, input.contents); return { storageKey }; }
  async read(storageKey: string) { const value = this.contents.get(storageKey); if (!value) throw new Error("Missing"); return value; }
  async remove(storageKey: string) { this.contents.delete(storageKey); }
}

class FailingRemoveStorageProvider extends MemoryStorageProvider {
  async remove(): Promise<void> { throw new Error("disk cleanup failed"); }
}

class FakeOcrProvider implements OcrProvider {
  constructor(private readonly text: string) {}
  async extract() { return this.text; }
}

class MemoryDocumentRepository implements DocumentRepository {
  readonly citizen = { id: "citizen-1", userId: "user-1", fullName: "Demo Citizen" } as CitizenProfile;
  readonly application: any;
  readonly documents = new Map<string, any>();
  readonly verificationRecords = new Map<string, { status: string }>();
  verificationUpdates = 0;

  constructor() {
    this.application = {
      id: "application-1", citizenId: this.citizen.id, status: ApplicationStatus.DRAFT, formData: { fullName: "Demo Citizen", dateOfBirth: "01/01/1990" },
      service: { requirements: [{ id: "requirement-identity", name: "Identity Proof", isRequired: true }, { id: "requirement-address", name: "Address Proof", isRequired: true }] },
      applicationDocuments: [],
    };
  }
  async findCitizenByUserId(userId: string) { return userId === this.citizen.userId ? this.citizen : null; }
  async findOwnedApplication(applicationId: string, citizenId: string) { return applicationId === this.application.id && citizenId === this.citizen.id ? this.application as OwnedApplicationForDocuments : null; }
  async createDocument(input: any) {
    const document: any = {
      id: randomUUID(), ...input, uploadedAt: new Date(), status: DocumentStatus.UPLOADED, aiExtractionResult: null,
      rejectionReason: null, updatedAt: new Date(), applicationLinks: [{ applicationId: input.applicationId, documentId: "", requirementId: input.requirementId ?? null, application: this.application }],
    };
    document.applicationLinks[0].documentId = document.id;
    this.documents.set(document.id, document);
    this.application.applicationDocuments.push({ requirementId: input.requirementId ?? null, document });
    return document as OwnedDocument;
  }
  async findOwnedDocument(documentId: string, citizenId: string) { return citizenId === this.citizen.id ? (this.documents.get(documentId) ?? null) as OwnedDocument | null : null; }
  async listOwnedDocuments(applicationId: string, citizenId: string) { return applicationId === this.application.id && citizenId === this.citizen.id ? [...this.documents.values()] as OwnedDocument[] : []; }
  async updateAnalysis(input: any) {
    const document = this.documents.get(input.documentId);
    document.documentType = input.detectedDocumentType;
    document.status = DocumentStatus.PENDING_VERIFICATION;
    if (input.requirementId) document.applicationLinks[0].requirementId = input.requirementId;
    document.aiExtractionResult = input.analysis;
    this.verificationUpdates += 1;
    this.verificationRecords.set(input.documentId, { status: "MANUAL_REVIEW" });
    document.verificationStatus = input.verificationStatus;
    return document as OwnedDocument;
  }
  async deleteApplicationDocument(input: { documentId: string; applicationId: string }) {
    if (input.applicationId !== this.application.id) return false;
    this.documents.delete(input.documentId);
    this.application.applicationDocuments = this.application.applicationDocuments.filter((link: any) => link.document.id !== input.documentId);
    return true;
  }
}

function validPng(width = 1, height = 1): Buffer {
  if (width === 1 && height === 1) {
    return Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4AWJiYGD4DwAAAP//cGajQwAAAAZJREFUAwABDgEC81VxbAAAAABJRU5ErkJggg==", "base64");
  }
  const buffer = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer);
  buffer.writeUInt32BE(13, 8); Buffer.from("IHDR").copy(buffer, 12); buffer.writeUInt32BE(width, 16); buffer.writeUInt32BE(height, 20);
  return buffer;
}

function validJpeg(width = 1, height = 1): Buffer {
  const buffer = Buffer.alloc(23);
  buffer[0] = 0xff; buffer[1] = 0xd8;
  buffer[2] = 0xff; buffer[3] = 0xc0;
  buffer.writeUInt16BE(17, 4); buffer[6] = 8;
  buffer.writeUInt16BE(height, 7); buffer.writeUInt16BE(width, 9); buffer[11] = 3;
  buffer[12] = 1; buffer[13] = 0x11; buffer[14] = 0;
  buffer[15] = 2; buffer[16] = 0x11; buffer[17] = 0;
  buffer[18] = 3; buffer[19] = 0x11; buffer[20] = 0;
  buffer[21] = 0xff; buffer[22] = 0xd9;
  return buffer;
}

function makeFile(contents: Buffer | string = validPng(), mimetype = "image/png", name = "identity.png"): Express.Multer.File {
  const buffer = Buffer.isBuffer(contents) ? contents : Buffer.from(contents);
  return { fieldname: "file", originalname: name, encoding: "7bit", mimetype, size: buffer.length, buffer, destination: "", filename: "", path: "", stream: undefined as any };
}

describe("DocumentService", () => {
  let repository: MemoryDocumentRepository;
  let storage: MemoryStorageProvider;
  let service: DocumentService;

  beforeEach(() => {
    repository = new MemoryDocumentRepository();
    storage = new MemoryStorageProvider();
    service = new DocumentService(repository, new StorageService(storage), new FakeOcrProvider("Name: Demo Citizen\nDOB: 01/01/1990\nUIDAI\n1234 5678 9012\nAddress: Demo City"));
  });

  it("uploads a safe owned document with SHA-256 metadata and lists/retrieves it", async () => {
    const contents = validPng();
    const document = await service.upload("user-1", "application-1", { file: makeFile(contents), expectedDocumentType: "AADHAAR", requirementId: "requirement-identity" });
    expect(document.storageKey).not.toContain("identity.png");
    expect(document.sha256).toBe(createHash("sha256").update(contents).digest("hex"));
    await expect(service.list("user-1", "application-1")).resolves.toHaveLength(1);
    await expect(service.get("user-1", document.id)).resolves.toMatchObject({ id: document.id, status: DocumentStatus.UPLOADED });
  });

  it("accepts a valid JPEG upload and preserves its upload metadata", async () => {
    const contents = validJpeg(1200, 900);
    const filename = "Passport proof (final) #1.jpg";
    const document = await service.upload("user-1", "application-1", { file: makeFile(contents, "image/jpeg", filename) });

    expect(document).toMatchObject({ originalFilename: filename, mimeType: "image/jpeg", fileSizeBytes: contents.length });
    expect(document.sha256).toBe(createHash("sha256").update(contents).digest("hex"));
    expect(storage.contents.get(document.storageKey)).toEqual(contents);
  });

  it.each([ApplicationStatus.IDENTITY_VERIFIED, ApplicationStatus.SUBMITTED, ApplicationStatus.APPROVED, ApplicationStatus.SIGNED, ApplicationStatus.COMPLETED])("blocks document mutation after %s", async (status) => {
    const document = await service.upload("user-1", "application-1", { file: makeFile() });
    repository.application.status = status;

    await expect(service.upload("user-1", "application-1", { file: makeFile() })).rejects.toMatchObject({ statusCode: 409 });
    await expect(service.delete("user-1", document.id)).rejects.toMatchObject({ statusCode: 409 });
    await expect(service.analyze("user-1", document.id)).rejects.toMatchObject({ statusCode: 409 });
  });

  it("rejects unsupported MIME/extension and files over 4 MB", async () => {
    await expect(service.upload("user-1", "application-1", { file: makeFile("bad", "text/plain", "bad.txt") })).rejects.toMatchObject({ statusCode: 400 });
    const oversized = makeFile(validPng(), "image/png", "large.png"); oversized.size = 4 * 1024 * 1024 + 1;
    await expect(service.upload("user-1", "application-1", { file: oversized })).rejects.toMatchObject({ statusCode: 413 });
  });

  it("rejects spoofed PNG/PDF content even when MIME type and extension claim a supported format", async () => {
    await expect(service.upload("user-1", "application-1", { file: makeFile("arbitrary bytes", "image/png", "fake.png") })).rejects.toMatchObject({ statusCode: 400 });
    await expect(service.upload("user-1", "application-1", { file: makeFile("not a PDF", "application/pdf", "fake.pdf") })).rejects.toMatchObject({ statusCode: 400 });
    await expect(service.upload("user-1", "application-1", { file: makeFile(validPng(), "image/jpeg", "fake.jpg") })).rejects.toMatchObject({ statusCode: 400 });
  });

  it("rejects malformed and oversized-pixel image payloads before storing them", async () => {
    const malformedHeader = Buffer.alloc(24); Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(malformedHeader);
    await expect(service.upload("user-1", "application-1", { file: makeFile(malformedHeader) })).rejects.toMatchObject({ statusCode: 400 });
    await expect(service.upload("user-1", "application-1", { file: makeFile(validPng(5000, 5000)) })).rejects.toMatchObject({ statusCode: 422 });
    await expect(service.upload("user-1", "application-1", { file: makeFile(validJpeg(5000, 5000), "image/jpeg", "large.jpg") })).rejects.toMatchObject({ statusCode: 422 });
  });

  it("does not permit a citizen to upload to or access another citizen's application document", async () => {
    const document = await service.upload("user-1", "application-1", { file: makeFile() });
    await expect(service.upload("user-2", "application-1", { file: makeFile() })).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.get("user-2", document.id)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("deletes both the controlled stored file and metadata", async () => {
    const document = await service.upload("user-1", "application-1", { file: makeFile() });
    expect(storage.contents.has(document.storageKey)).toBe(true);
    await service.delete("user-1", document.id);
    expect(storage.contents.has(document.storageKey)).toBe(false);
    await expect(service.get("user-1", document.id)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("does not leave a database document record when physical cleanup fails", async () => {
    const failingStorage = new FailingRemoveStorageProvider();
    const deletionService = new DocumentService(repository, new StorageService(failingStorage), new FakeOcrProvider("UIDAI\n1234 5678 9012"));
    const document = await deletionService.upload("user-1", "application-1", { file: makeFile() });
    await expect(deletionService.delete("user-1", document.id)).rejects.toMatchObject({ statusCode: 500 });
    await expect(deletionService.get("user-1", document.id)).rejects.toMatchObject({ statusCode: 404 });
    expect(failingStorage.contents.has(document.storageKey)).toBe(true);
  });

  it("runs the deterministic fallback, detects missing required documents/mismatches, and creates a verification update", async () => {
    const document = await service.upload("user-1", "application-1", { file: makeFile(), expectedDocumentType: "PAN", requirementId: "requirement-identity" });
    const result = await service.analyze("user-1", document.id);
    expect(result.analysis.documentType).toBe("AADHAAR");
    expect(result.document.documentType).toBe("AADHAAR");
    expect(result.document.expectedDocumentType).toBe("PAN");
    expect(result.analysis.detectedIssues).toContain("Document type mismatch: expected PAN, detected AADHAAR");
    expect(result.analysis.detectedIssues).toContain("Required document not provided: Address Proof");
    expect(result.document.status).toBe(DocumentStatus.PENDING_VERIFICATION);
    expect(repository.verificationUpdates).toBe(1);
    await expect(service.verification("user-1", document.id)).resolves.toMatchObject({ documentType: "AADHAAR", signatureDetected: "NOT_AVAILABLE" });
  });

  it("masks identifier output and does not persist raw OCR text", async () => {
    const document = await service.upload("user-1", "application-1", { file: makeFile(), expectedDocumentType: "AADHAAR", requirementId: "requirement-identity" });
    const result = await service.analyze("user-1", document.id);

    expect(result.analysis.fields.documentNumber).toBe("XXXX-XXXX-9012");
    expect(JSON.stringify(repository.documents.get(document.id).aiExtractionResult)).not.toContain("1234 5678 9012");
    expect(JSON.stringify(repository.documents.get(document.id).aiExtractionResult)).not.toContain("123456789012");
    expect(repository.documents.get(document.id).aiExtractionResult.ocr).toEqual({ provider: "TesseractOcrProvider", textLength: expect.any(Number) });
  });

  it("associates an unambiguous expected type with its matching service requirement", async () => {
    repository.application.service.requirements.push({ id: "requirement-pan", name: "PAN Supporting Document", isRequired: true });
    const document = await service.upload("user-1", "application-1", { file: makeFile(), expectedDocumentType: "PAN" });
    expect(document.applicationLinks[0].requirementId).toBe("requirement-pan");
  });

  it("associates an unambiguous detected type after analysis when no expected type was supplied", async () => {
    repository.application.service.requirements.push({ id: "requirement-aadhaar", name: "Aadhaar Proof", isRequired: true });
    const document = await service.upload("user-1", "application-1", { file: makeFile() });
    const result = await service.analyze("user-1", document.id);
    expect(result.document.applicationLinks[0].requirementId).toBe("requirement-aadhaar");
  });

  it("re-analyzes through one logical verification record rather than accumulating duplicates", async () => {
    const document = await service.upload("user-1", "application-1", { file: makeFile(), requirementId: "requirement-identity" });
    await service.analyze("user-1", document.id);
    await service.analyze("user-1", document.id);
    expect(repository.verificationUpdates).toBe(2);
    expect(repository.verificationRecords.size).toBe(1);
  });

  it("rejects arbitrary invalid AI-provider output before persistence", async () => {
    const invalidProvider: DocumentAnalysisProvider = { analyze: async () => ({ documentType: "AADHAAR" } as any) };
    const invalidService = new DocumentService(repository, new StorageService(storage), new FakeOcrProvider("UIDAI\n1234 5678 9012"), invalidProvider);
    const document = await invalidService.upload("user-1", "application-1", { file: makeFile(), requirementId: "requirement-identity" });
    await expect(invalidService.analyze("user-1", document.id)).rejects.toBeDefined();
    expect(repository.verificationUpdates).toBe(0);
  });

  it("returns a controlled OCR failure without persisting a verification", async () => {
    const failingOcr: OcrProvider = { extract: async () => { throw new AppError("OCR could not process this document", 422); } };
    const failingService = new DocumentService(repository, new StorageService(storage), failingOcr);
    const document = await failingService.upload("user-1", "application-1", { file: makeFile(), requirementId: "requirement-identity" });
    await expect(failingService.analyze("user-1", document.id)).rejects.toMatchObject({ statusCode: 422 });
    expect(repository.verificationRecords.size).toBe(0);
  });
});

describe("document upload multipart boundary", () => {
  const uploadApp = express();
  uploadApp.post("/upload", documentUpload.single("file"), (request, response) => response.status(201).json({ fileCount: request.file ? 1 : 0, filename: request.file?.originalname }));
  uploadApp.use((_error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => response.status(400).json({ success: false }));

  it("accepts one compatible JPEG file and rejects duplicate multipart file fields", async () => {
    const filename = "Passport proof (final) #1.jpg";
    const oneFile = await request(uploadApp).post("/upload").attach("file", validJpeg(), { filename, contentType: "image/jpeg" }).expect(201);
    expect(oneFile.body).toEqual({ fileCount: 1, filename });

    await request(uploadApp)
      .post("/upload")
      .attach("file", validJpeg(), { filename, contentType: "image/jpeg" })
      .attach("file", validJpeg(), { filename: "duplicate.jpg", contentType: "image/jpeg" })
      .expect(400);
  });
});

describe("document endpoint validation", () => {
  it("rejects unexpected bodies for endpoints that require no body", () => {
    expect(documentIdParamsSchema.safeParse({ body: { ignored: true }, params: { documentId: randomUUID() }, query: {} }).success).toBe(false);
  });
});

describe("DeterministicDocumentAnalysisProvider", () => {
  it("returns strict structured data and leaves unsupported fields null", async () => {
    const result = await new DeterministicDocumentAnalysisProvider().analyze({ ocrText: "INCOME CERTIFICATE", originalFilename: "income.pdf", requiredDocumentNames: [] });
    expect(documentAnalysisSchema.safeParse(result).success).toBe(true);
    expect(result.fields.fullName).toBeNull();
    expect(result.documentType).toBe("INCOME_CERTIFICATE");
  });
});

describe("TesseractOcrProvider PDF handling", () => {
  it("extracts embedded text through the PDF branch without loading the package CLI entrypoint", async () => {
    const contents = await readFile("tests/assets/sample.pdf");
    const text = await new TesseractOcrProvider().extract({ contents, mimeType: "application/pdf" });
    expect(text.length).toBeGreaterThan(0);
  });

  it("returns a controlled error for a corrupt PNG instead of terminating the process", async () => {
    const corruptPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLJpAAAAABJRU5ErkJggg==", "base64");
    await expect(new TesseractOcrProvider().extract({ contents: corruptPng, mimeType: "image/png" }))
      .rejects.toMatchObject({ statusCode: 400, message: "Image content is malformed" });
  });
});
