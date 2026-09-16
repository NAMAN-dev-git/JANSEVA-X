import { ApplicationStatus, DocumentStatus, OfficerReviewStatus, Prisma, VerificationStatus, VerificationType } from "@prisma/client";
import { prisma } from "../lib/prisma";

const applicationInclude = {
  service: { select: { id: true, name: true, slug: true, isPrototype: true } },
  citizen: { select: { id: true, fullName: true, city: true, state: true } },
  assignedOfficer: { include: { user: { select: { displayName: true, email: true } } } },
  applicationDocuments: { include: { document: { include: { verifications: { where: { type: VerificationType.DOCUMENT }, select: { status: true, failureReason: true, verifiedAt: true, updatedAt: true } } } } } },
  statusHistory: { orderBy: { createdAt: "asc" as const }, include: { changedBy: { select: { displayName: true, email: true, role: true } } } },
} as const;

const identityVerificationTypes: VerificationType[] = [VerificationType.AADHAAR, VerificationType.PAN, VerificationType.FACE, VerificationType.FINGERPRINT, VerificationType.E_KYC];

const reviewApplicationInclude = {
  service: { select: { id: true, name: true, slug: true, description: true, isPrototype: true, requirements: { select: { id: true, name: true, description: true, isRequired: true, sortOrder: true }, orderBy: { sortOrder: "asc" } } } },
  citizen: { select: { id: true, fullName: true, city: true, state: true } },
  assignedOfficer: { select: { id: true, department: true, designation: true, user: { select: { displayName: true } } } },
  applicationDocuments: { orderBy: { createdAt: "asc" }, select: { requirementId: true, label: true, document: { select: { id: true, documentType: true, expectedDocumentType: true, originalFilename: true, mimeType: true, fileSizeBytes: true, status: true, rejectionReason: true, uploadedAt: true, aiExtractionResult: true, verifications: { where: { type: VerificationType.DOCUMENT }, select: { id: true, status: true, failureReason: true, verifiedAt: true, createdAt: true, updatedAt: true } } } } } },
  verifications: { where: { type: { in: identityVerificationTypes } }, select: { id: true, type: true, status: true, failureReason: true, verifiedAt: true, createdAt: true, updatedAt: true }, orderBy: { createdAt: "asc" } },
  statusHistory: { orderBy: { createdAt: "asc" }, include: { changedBy: { select: { displayName: true, role: true } } } },
} as const;

const registryInclude = {
  service: { select: { id: true, name: true, slug: true, isPrototype: true } },
  citizen: { select: { id: true, fullName: true, city: true, state: true } },
  assignedOfficer: { include: { user: { select: { displayName: true } } } },
} as const;

export interface RegistryQuery {
  page: number;
  limit: number;
  status?: ApplicationStatus;
  reviewStatus?: OfficerReviewStatus;
  serviceId?: string;
  search?: string;
  assignedOfficerId?: string | "unassigned";
  submittedFrom?: Date;
  submittedTo?: Date;
  sortBy: "submittedAt" | "createdAt" | "updatedAt";
  sortOrder: "asc" | "desc";
}

export interface CompletedQuery {
  page: number;
  limit: number;
  serviceId?: string;
  search?: string;
  sortBy: "createdAt" | "updatedAt";
  sortOrder: "asc" | "desc";
}

interface ScopedQuery {
  officerId?: string;
  isAdmin: boolean;
}

export type IdentityReviewAction = "VERIFY" | "REJECT" | "REQUEST_MANUAL_REVIEW";

export class EmployeeRepository {
  findOfficerByUserId(userId: string) { return prisma.officer.findFirst({ where: { userId, isActive: true, user: { isActive: true } }, include: { user: { select: { id: true, email: true, displayName: true, role: true, isActive: true } } } }); }
  findUser(userId: string) { return prisma.user.findFirst({ where: { id: userId, isActive: true }, select: { id: true, email: true, displayName: true, role: true, isActive: true } }); }
  async queue(input: ScopedQuery & RegistryQuery) {
    const where = this.registryWhere(input);
    const [applications, total] = await prisma.$transaction([
      prisma.application.findMany({ where, skip: (input.page - 1) * input.limit, take: input.limit, orderBy: [{ [input.sortBy]: input.sortOrder }, { id: "asc" }], include: registryInclude }),
      prisma.application.count({ where }),
    ]);
    return { applications, total };
  }
  async completed(input: ScopedQuery & CompletedQuery) {
    const where = this.registryWhere({ ...input, status: ApplicationStatus.COMPLETED });
    const [applications, total] = await prisma.$transaction([
      prisma.application.findMany({ where, skip: (input.page - 1) * input.limit, take: input.limit, orderBy: [{ [input.sortBy]: input.sortOrder }, { id: "asc" }], include: { ...registryInclude, statusHistory: { where: { status: ApplicationStatus.COMPLETED }, orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } } } }),
      prisma.application.count({ where }),
    ]);
    return { applications, total };
  }
  async dashboard(input: ScopedQuery) {
    const visibility = this.visibilityWhere(input);
    const claimable = this.andWhere(visibility, { assignedOfficerId: null, status: ApplicationStatus.SUBMITTED, reviewStatus: OfficerReviewStatus.NOT_ASSIGNED });
    const [total, byStatus, byReviewStatus, claimableCount, recentApplications] = await prisma.$transaction([
      prisma.application.count({ where: visibility }),
      prisma.application.groupBy({ by: ["status"], where: visibility, orderBy: { status: "asc" }, _count: { _all: true } }),
      prisma.application.groupBy({ by: ["reviewStatus"], where: visibility, orderBy: { reviewStatus: "asc" }, _count: { _all: true } }),
      prisma.application.count({ where: claimable }),
      prisma.application.findMany({ where: visibility, take: 5, orderBy: [{ updatedAt: "desc" }, { id: "asc" }], include: registryInclude }),
    ]);
    return { total, byStatus: byStatus.map((entry) => ({ status: entry.status, count: (entry._count as { _all?: number } | undefined)?._all ?? 0 })), byReviewStatus: byReviewStatus.map((entry) => ({ reviewStatus: entry.reviewStatus, count: (entry._count as { _all?: number } | undefined)?._all ?? 0 })), claimableCount, recentApplications };
  }
  private visibilityWhere(input: ScopedQuery): Prisma.ApplicationWhereInput {
    return input.isAdmin ? {} : { OR: [{ assignedOfficerId: input.officerId }, { assignedOfficerId: null, status: ApplicationStatus.SUBMITTED, reviewStatus: OfficerReviewStatus.NOT_ASSIGNED }] };
  }
  private registryWhere(input: ScopedQuery & { status?: ApplicationStatus; reviewStatus?: OfficerReviewStatus; serviceId?: string; search?: string; assignedOfficerId?: string | "unassigned"; submittedFrom?: Date; submittedTo?: Date }): Prisma.ApplicationWhereInput {
    const submittedAt = input.submittedFrom || input.submittedTo ? { ...(input.submittedFrom ? { gte: input.submittedFrom } : {}), ...(input.submittedTo ? { lte: input.submittedTo } : {}) } : undefined;
    return this.andWhere(
      this.visibilityWhere(input),
      input.status ? { status: input.status } : {},
      input.reviewStatus ? { reviewStatus: input.reviewStatus } : {},
      input.serviceId ? { serviceId: input.serviceId } : {},
      input.assignedOfficerId ? { assignedOfficerId: input.assignedOfficerId === "unassigned" ? null : input.assignedOfficerId } : {},
      submittedAt ? { submittedAt } : {},
      input.search ? { OR: [{ applicationNumber: { contains: input.search, mode: "insensitive" } }, { citizen: { fullName: { contains: input.search, mode: "insensitive" } } }] } : {},
    );
  }
  private andWhere(...conditions: Prisma.ApplicationWhereInput[]): Prisma.ApplicationWhereInput { return { AND: conditions }; }
  findApplication(applicationId: string) { return prisma.application.findUnique({ where: { id: applicationId }, include: applicationInclude }); }
  findReviewApplication(applicationId: string) { return prisma.application.findUnique({ where: { id: applicationId }, include: reviewApplicationInclude }); }
  async reviewIdentityVerification(applicationId: string, verificationId: string, action: IdentityReviewAction, note: string, userId: string) {
    return prisma.$transaction(async (tx) => {
      const verification = await tx.verification.findFirst({ where: { id: verificationId, applicationId, type: { in: identityVerificationTypes } }, select: { id: true, type: true } });
      if (!verification) return null;
      const application = await tx.application.findUnique({ where: { id: applicationId }, select: { status: true } });
      if (!application) return null;
      const status = action === "VERIFY" ? VerificationStatus.VERIFIED : action === "REJECT" ? VerificationStatus.FAILED : VerificationStatus.MANUAL_REVIEW;
      await tx.verification.update({ where: { id: verificationId }, data: { status, failureReason: action === "VERIFY" ? null : note, verifiedAt: action === "VERIFY" ? new Date() : null } });
      await tx.applicationStatusHistory.create({ data: { applicationId, status: application.status, note: `Identity verification ${verification.type} reviewed: ${note}`, changedByUserId: userId } });
      return tx.verification.findUnique({ where: { id: verificationId }, select: { id: true, type: true, status: true, failureReason: true, verifiedAt: true, createdAt: true, updatedAt: true } });
    });
  }
  async claim(applicationId: string, officerId: string, userId: string) { return prisma.$transaction(async (tx) => { const result = await tx.application.updateMany({ where: { id: applicationId, status: ApplicationStatus.SUBMITTED, assignedOfficerId: null, reviewStatus: OfficerReviewStatus.NOT_ASSIGNED }, data: { assignedOfficerId: officerId, reviewStatus: OfficerReviewStatus.ASSIGNED, assignedAt: new Date() } }); if (result.count !== 1) return null; await tx.applicationStatusHistory.create({ data: { applicationId, status: ApplicationStatus.SUBMITTED, note: "Application claimed for review", changedByUserId: userId } }); return tx.application.findUnique({ where: { id: applicationId }, include: applicationInclude }); }); }
  async release(applicationId: string, officerId: string | undefined, userId: string) { return prisma.$transaction(async (tx) => { const result = await tx.application.updateMany({ where: { id: applicationId, ...(officerId ? { assignedOfficerId: officerId } : {}), reviewStatus: OfficerReviewStatus.ASSIGNED }, data: { assignedOfficerId: null, reviewStatus: OfficerReviewStatus.NOT_ASSIGNED, assignedAt: null } }); if (result.count !== 1) return null; const app = await tx.application.findUniqueOrThrow({ where: { id: applicationId } }); await tx.applicationStatusHistory.create({ data: { applicationId, status: app.status, note: "Application released from review queue", changedByUserId: userId } }); return app; }); }
  async assign(applicationId: string, officerId: string | null, userId: string) { return prisma.$transaction(async (tx) => { if (officerId) { const officer = await tx.officer.findFirst({ where: { id: officerId, isActive: true, user: { isActive: true } } }); if (!officer) return "OFFICER_NOT_FOUND" as const; } const app = await tx.application.findUnique({ where: { id: applicationId } }); if (!app) return null; await tx.application.update({ where: { id: applicationId }, data: { assignedOfficerId: officerId, reviewStatus: officerId ? OfficerReviewStatus.ASSIGNED : OfficerReviewStatus.NOT_ASSIGNED, assignedAt: officerId ? new Date() : null } }); await tx.applicationStatusHistory.create({ data: { applicationId, status: app.status, note: officerId ? "Application assigned for review" : "Application assignment released", changedByUserId: userId } }); return tx.application.findUnique({ where: { id: applicationId }, include: applicationInclude }); }); }
  async startReview(applicationId: string, officerId: string | undefined, userId: string) { return prisma.$transaction(async (tx) => { const result = await tx.application.updateMany({ where: { id: applicationId, status: ApplicationStatus.SUBMITTED, reviewStatus: OfficerReviewStatus.ASSIGNED, ...(officerId ? { assignedOfficerId: officerId } : {}) }, data: { status: ApplicationStatus.UNDER_REVIEW, reviewStatus: OfficerReviewStatus.IN_REVIEW } }); if (result.count !== 1) return null; await tx.applicationStatusHistory.create({ data: { applicationId, status: ApplicationStatus.UNDER_REVIEW, note: "Review started", changedByUserId: userId } }); return tx.application.findUnique({ where: { id: applicationId }, include: applicationInclude }); }); }
  async decide(applicationId: string, nextStatus: ApplicationStatus, note: string, userId: string, officerId?: string) { return prisma.$transaction(async (tx) => { const app = await tx.application.findUnique({ where: { id: applicationId } }); if (!app) return null; const result = await tx.application.updateMany({ where: { id: applicationId, status: app.status, ...(officerId ? { assignedOfficerId: officerId } : {}) }, data: { status: nextStatus, reviewStatus: nextStatus === ApplicationStatus.UNDER_REVIEW ? OfficerReviewStatus.IN_REVIEW : OfficerReviewStatus.REVIEWED, reviewedAt: nextStatus === ApplicationStatus.UNDER_REVIEW ? null : new Date(), correctionReason: nextStatus === ApplicationStatus.CORRECTION_REQUIRED ? note : null } }); if (result.count !== 1) return "CONFLICT" as const; await tx.applicationStatusHistory.create({ data: { applicationId, status: nextStatus, note, changedByUserId: userId } }); return tx.application.findUnique({ where: { id: applicationId }, include: applicationInclude }); }); }
  async reviewDocument(documentId: string, action: "VERIFY" | "REJECT" | "REQUEST_CORRECTION", note: string) { return prisma.$transaction(async (tx) => { const document = await tx.document.findUnique({ where: { id: documentId }, include: { applicationLinks: { include: { application: true } } } }); const link = document?.applicationLinks[0]; if (!document || !link) return null; const status = action === "VERIFY" ? DocumentStatus.VERIFIED : action === "REJECT" ? DocumentStatus.REJECTED : DocumentStatus.CORRECTION_REQUIRED; const verificationStatus = action === "VERIFY" ? VerificationStatus.VERIFIED : action === "REJECT" ? VerificationStatus.FAILED : VerificationStatus.MANUAL_REVIEW; await tx.document.update({ where: { id: documentId }, data: { status, rejectionReason: action === "VERIFY" ? null : note } }); await tx.verification.upsert({ where: { documentId_type: { documentId, type: VerificationType.DOCUMENT } }, create: { applicationId: link.applicationId, citizenId: link.application.citizenId, documentId, type: VerificationType.DOCUMENT, status: verificationStatus, failureReason: action === "VERIFY" ? null : note, verifiedAt: action === "VERIFY" ? new Date() : null }, update: { status: verificationStatus, failureReason: action === "VERIFY" ? null : note, verifiedAt: action === "VERIFY" ? new Date() : null } }); return tx.document.findUnique({ where: { id: documentId }, include: { applicationLinks: { include: { application: true } }, verifications: { where: { type: VerificationType.DOCUMENT } } } }); }); }
}
