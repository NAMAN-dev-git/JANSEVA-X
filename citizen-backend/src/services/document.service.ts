import { createHash } from "crypto";
import type { Prisma } from "@prisma/client";
import type { Express } from "express";
import path from "path";
import { type DocumentRepository, type OwnedDocument, PrismaDocumentRepository } from "../repositories/document.repository";
import { AppError } from "../utils/app-error";
import { type DocumentAnalysis, type DocumentAnalysisProvider, type DocumentType, DeterministicDocumentAnalysisProvider, detectDocumentType, documentAnalysisSchema, documentTypeForRequirement, documentTypes } from "./document-analysis.service";
import { assertValidDocumentFile } from "./document-file-validation";
import { type OcrProvider, TesseractOcrProvider } from "./ocr.service";
import { StorageService } from "./storage/storage.service";

export interface UploadDocumentInput {
  file: Express.Multer.File;
  expectedDocumentType?: DocumentType;
  requirementId?: string;
}

export class DocumentService {
  constructor(
    private readonly repository: DocumentRepository = new PrismaDocumentRepository(),
    private readonly storage: StorageService = new StorageService(),
    private readonly ocr: OcrProvider = new TesseractOcrProvider(),
    private readonly analyzer: DocumentAnalysisProvider = new DeterministicDocumentAnalysisProvider(),
  ) {}

  async upload(userId: string, applicationId: string, input: UploadDocumentInput): Promise<OwnedDocument> {
    const citizen = await this.getCitizen(userId);
    const application = await this.repository.findOwnedApplication(applicationId, citizen.id);
    if (!application) throw new AppError("Application not found", 404);
    assertValidDocumentFile(input.file);
    if (input.requirementId && !application.service.requirements.some((requirement) => requirement.id === input.requirementId)) {
      throw new AppError("Service requirement not found for this application", 400);
    }
    const requirementId = input.requirementId ?? inferRequirementId(application.service.requirements, input.expectedDocumentType);
    const stored = await this.storage.store(input.file.buffer, input.file.originalname);
    try {
      return await this.repository.createDocument({
        userId,
        applicationId,
        requirementId,
        expectedDocumentType: input.expectedDocumentType,
        originalFilename: path.basename(input.file.originalname).slice(0, 500),
        storageKey: stored.storageKey,
        mimeType: input.file.mimetype,
        fileSizeBytes: input.file.size,
        sha256: createHash("sha256").update(input.file.buffer).digest("hex"),
      });
    } catch (error) {
      await this.storage.remove(stored.storageKey);
      throw error;
    }
  }

  async list(userId: string, applicationId: string): Promise<OwnedDocument[]> {
    const citizen = await this.getCitizen(userId);
    if (!await this.repository.findOwnedApplication(applicationId, citizen.id)) throw new AppError("Application not found", 404);
    return this.repository.listOwnedDocuments(applicationId, citizen.id);
  }

  async get(userId: string, documentId: string): Promise<OwnedDocument> {
    const citizen = await this.getCitizen(userId);
    return this.getOwnedDocument(documentId, citizen.id);
  }

  async delete(userId: string, documentId: string): Promise<void> {
    const citizen = await this.getCitizen(userId);
    const document = await this.getOwnedDocument(documentId, citizen.id);
    const applicationId = document.applicationLinks[0]?.applicationId;
    if (!applicationId) throw new AppError("Document not found", 404);
    const deletedPhysicalDocument = await this.repository.deleteApplicationDocument({ documentId, applicationId });
    if (deletedPhysicalDocument) await this.storage.remove(document.storageKey);
  }

  async analyze(userId: string, documentId: string): Promise<{ document: OwnedDocument; analysis: DocumentAnalysis }> {
    const citizen = await this.getCitizen(userId);
    const document = await this.getOwnedDocument(documentId, citizen.id);
    const application = document.applicationLinks.find((link) => link.application.citizenId === citizen.id)?.application;
    if (!application) throw new AppError("Document not found", 404);
    const contents = await this.storage.read(document.storageKey);
    const ocrText = await this.ocr.extract({ contents, mimeType: document.mimeType });
    const existingRequirementId = document.applicationLinks.find((link) => link.applicationId === application.id)?.requirementId ?? undefined;
    const inferredRequirementId = existingRequirementId ?? inferRequirementId(application.service.requirements, detectOnly(ocrText, document.originalFilename, document.expectedDocumentType));
    const requiredDocumentNames = application.service.requirements
      .filter((requirement) => requirement.isRequired && requirement.id !== inferredRequirementId && !application.applicationDocuments.some((link) => link.requirementId === requirement.id))
      .map((requirement) => requirement.name);
    const analysis = documentAnalysisSchema.parse(await this.analyzer.analyze({
      ocrText,
      originalFilename: document.originalFilename,
      expectedDocumentType: normalizeDocumentType(document.expectedDocumentType),
      applicationData: application.formData,
      requiredDocumentNames,
    }));
    const persisted = await this.repository.updateAnalysis({
      documentId,
      applicationId: application.id,
      citizenId: citizen.id,
      detectedDocumentType: analysis.documentType,
      requirementId: inferredRequirementId,
      analysis: { analysis, ocr: { provider: "TesseractOcrProvider", text: ocrText.slice(0, 100_000) }, mode: "DEMO/PROTOTYPE automated analysis; not government or authenticity verification", verificationState: "MANUAL_REVIEW_REQUIRED" } as Prisma.InputJsonValue,
    });
    return { document: persisted, analysis };
  }

  async verification(userId: string, documentId: string): Promise<DocumentAnalysis | null> {
    const document = await this.get(userId, documentId);
    const result = document.aiExtractionResult as { analysis?: unknown } | null;
    return result?.analysis ? documentAnalysisSchema.parse(result.analysis) : null;
  }

  private async getCitizen(userId: string) {
    const citizen = await this.repository.findCitizenByUserId(userId);
    if (!citizen) throw new AppError("Citizen profile not found", 404);
    return citizen;
  }

  private async getOwnedDocument(documentId: string, citizenId: string): Promise<OwnedDocument> {
    const document = await this.repository.findOwnedDocument(documentId, citizenId);
    if (!document) throw new AppError("Document not found", 404);
    return document;
  }
}

function normalizeDocumentType(value: string | null): DocumentType {
  return (documentTypes as readonly string[]).includes(value ?? "") ? value as DocumentType : "UNKNOWN";
}

function inferRequirementId(requirements: Array<{ id: string; name: string }>, documentType: DocumentType | undefined): string | undefined {
  if (!documentType || documentType === "UNKNOWN" || documentType === "OTHER") return undefined;
  const matches = requirements.filter((requirement) => documentTypeForRequirement(requirement.name) === documentType);
  return matches.length === 1 ? matches[0].id : undefined;
}

function detectOnly(text: string, originalFilename: string, expectedType: string | null): DocumentType {
  return detectDocumentType(text, originalFilename, normalizeDocumentType(expectedType));
}
