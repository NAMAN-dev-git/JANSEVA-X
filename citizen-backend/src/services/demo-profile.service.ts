import type { MockIssuedDocument } from "@prisma/client";
import { type DemoProfileRepository, type OwnedDemoProfile, PrismaDemoProfileRepository } from "../repositories/demo-profile.repository";
import { AppError } from "../utils/app-error";

export interface PublicDemoProfile {
  profileCode: string;
  fullName: string;
  mobile: string;
  isDemo: true;
  issuedDocumentCount: number;
  mode: "DEMO/PROTOTYPE";
}

export interface PublicMockIssuedDocument {
  documentId: string;
  documentCode: string;
  documentType: string;
  displayName: string;
  issuer: string;
  issueDate: Date;
  expiryDate: Date | null;
  status: string;
  structuredFields: unknown;
  isDemo: true;
  mode: "DEMO/PROTOTYPE";
}

export class DemoProfileService {
  constructor(private readonly repository: DemoProfileRepository = new PrismaDemoProfileRepository()) {}

  async getProfile(userId: string): Promise<PublicDemoProfile> {
    return presentProfile(await this.getOwnedProfile(userId));
  }

  async listIssuedDocuments(userId: string): Promise<PublicMockIssuedDocument[]> {
    const profile = await this.getOwnedProfile(userId);
    return profile.issuedDocuments.map(presentIssuedDocument);
  }

  async getIssuedDocument(userId: string, documentId: string): Promise<PublicMockIssuedDocument> {
    const document = await this.repository.findDocumentByIdForUser(documentId, userId);
    if (!document) throw new AppError("Issued demo document not found", 404);
    return presentIssuedDocument(document);
  }

  private async getOwnedProfile(userId: string): Promise<OwnedDemoProfile> {
    const profile = await this.repository.findByUserId(userId);
    if (!profile) throw new AppError("No demo profile is linked to this citizen account", 404);
    return profile;
  }
}

function presentProfile(profile: OwnedDemoProfile): PublicDemoProfile {
  return {
    profileCode: profile.profileCode,
    fullName: profile.citizenProfile.fullName,
    mobile: profile.normalizedMobile,
    isDemo: true,
    issuedDocumentCount: profile.issuedDocuments.length,
    mode: "DEMO/PROTOTYPE",
  };
}

function presentIssuedDocument(document: MockIssuedDocument): PublicMockIssuedDocument {
  return {
    documentId: document.id,
    documentCode: document.documentCode,
    documentType: document.documentType,
    displayName: document.displayName,
    issuer: document.issuer,
    issueDate: document.issueDate,
    expiryDate: document.expiryDate,
    status: document.status,
    structuredFields: document.structuredFields,
    isDemo: true,
    mode: "DEMO/PROTOTYPE",
  };
}
