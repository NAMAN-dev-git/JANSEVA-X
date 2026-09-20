import { ApplicationStatus, OfficerReviewStatus } from "@prisma/client";
import { EmployeeRepository, type CompletedQuery, type IdentityReviewAction, type RegistryQuery } from "../repositories/employee.repository";
import { CitizenGeneratedDocumentBridge, type CanonicalGeneratedDocumentIssuer } from "./citizen-generated-document-bridge";
import { AppError } from "../utils/app-error";
import { assertEmployeeTransition } from "./application-status.service";

export class EmployeeService {
  constructor(private readonly repository = new EmployeeRepository(), private readonly generatedDocumentIssuer: CanonicalGeneratedDocumentIssuer = new CitizenGeneratedDocumentBridge()) {}
  async profile(userId: string, role: string) { const user = await this.repository.findUser(userId); if (!user) throw new AppError("Authentication required", 401); const officer = await this.repository.findOfficerByUserId(userId); if (role === "OFFICER" && !officer) throw new AppError("Active officer profile not found", 403); return { user, officer }; }
  async queue(userId: string, role: "OFFICER" | "ADMIN", input: RegistryQuery) {
    const officer = role === "OFFICER" ? await this.requireOfficer(userId) : null;
    if (role === "OFFICER" && input.assignedOfficerId && input.assignedOfficerId !== officer!.id && input.assignedOfficerId !== "unassigned") throw new AppError("Officers can only filter their own or unassigned applications", 403);
    const result = await this.repository.queue({ ...input, officerId: officer?.id, isAdmin: role === "ADMIN" });
    return { ...result, page: input.page, limit: input.limit, totalPages: Math.ceil(result.total / input.limit) };
  }
  async completed(userId: string, role: "OFFICER" | "ADMIN", input: CompletedQuery) {
    const officer = role === "OFFICER" ? await this.requireOfficer(userId) : null;
    const result = await this.repository.completed({ ...input, officerId: officer?.id, isAdmin: role === "ADMIN" });
    return { ...result, page: input.page, limit: input.limit, totalPages: Math.ceil(result.total / input.limit) };
  }
  async dashboard(userId: string, role: "OFFICER" | "ADMIN") {
    const officer = role === "OFFICER" ? await this.requireOfficer(userId) : null;
    const result = await this.repository.dashboard({ officerId: officer?.id, isAdmin: role === "ADMIN" });
    const applicationStatusCounts = Object.fromEntries(Object.values(ApplicationStatus).map((status) => [status, 0])) as Record<ApplicationStatus, number>;
    const reviewStatusCounts = Object.fromEntries(Object.values(OfficerReviewStatus).map((status) => [status, 0])) as Record<OfficerReviewStatus, number>;
    for (const count of result.byStatus) applicationStatusCounts[count.status] = count.count;
    for (const count of result.byReviewStatus) reviewStatusCounts[count.reviewStatus] = count.count;
    return { total: result.total, claimableCount: result.claimableCount, applicationStatusCounts, reviewStatusCounts, recentApplications: result.recentApplications };
  }
  async detail(userId: string, role: "OFFICER" | "ADMIN", applicationId: string) { const app = await this.repository.findApplication(applicationId); if (!app) throw new AppError("Application not found", 404); if (role === "OFFICER") { const officer = await this.requireOfficer(userId); if (app.assignedOfficerId !== officer.id) throw new AppError("Application not found", 404); } return app; }
  async reviewDetail(userId: string, role: "OFFICER" | "ADMIN", applicationId: string) { const app = await this.repository.findReviewApplication(applicationId); if (!app) throw new AppError("Application not found", 404); if (role === "OFFICER") { const officer = await this.requireOfficer(userId); if (app.assignedOfficerId !== officer.id) throw new AppError("Application not found", 404); } return app; }
  async reviewIdentityVerification(userId: string, role: "OFFICER" | "ADMIN", applicationId: string, verificationId: string, action: IdentityReviewAction, note: string) { await this.reviewDetail(userId, role, applicationId); const verification = await this.repository.reviewIdentityVerification(applicationId, verificationId, action, note, userId); if (!verification) throw new AppError("Identity verification not found", 404); return verification; }
  async claim(userId: string) { const officer = await this.requireOfficer(userId); return officer; }
  async claimApplication(userId: string, applicationId: string) { const officer = await this.requireOfficer(userId); const app = await this.repository.claim(applicationId, officer.id, userId); if (!app) throw new AppError("Application is not available to claim", 409); return app; }
  async release(userId: string, role: "OFFICER" | "ADMIN", applicationId: string) { const officer = role === "OFFICER" ? await this.requireOfficer(userId) : undefined; const app = await this.repository.release(applicationId, officer?.id, userId); if (!app) throw new AppError("Application cannot be released", 409); return app; }
  async assign(userId: string, applicationId: string, officerId: string | null) { const result = await this.repository.assign(applicationId, officerId, userId); if (result === "OFFICER_NOT_FOUND") throw new AppError("Active officer not found", 404); if (result === "NOT_REVIEWABLE") throw new AppError("Only submitted applications can be assigned for review", 409); if (!result) throw new AppError("Application not found", 404); return result; }
  async start(userId: string, role: "OFFICER" | "ADMIN", applicationId: string) { const officer = role === "OFFICER" ? await this.requireOfficer(userId) : undefined; const app = await this.repository.startReview(applicationId, officer?.id, userId); if (!app) throw new AppError("Application cannot enter review", 409); return app; }
  async decision(userId: string, role: "OFFICER" | "ADMIN", applicationId: string, status: ApplicationStatus, note: string) { const existing = await this.repository.findApplication(applicationId); if (!existing) throw new AppError("Application not found", 404); if (role === "OFFICER") { const officer = await this.requireOfficer(userId); if (existing.assignedOfficerId !== officer.id) throw new AppError("Application not found", 404); } assertEmployeeTransition(existing.status, status); const officer = role === "OFFICER" ? await this.requireOfficer(userId) : undefined; const result = await this.repository.decide(applicationId, status, note, userId, officer?.id); if (result === "CONFLICT") throw new AppError("Application changed while being reviewed", 409); if (!result) throw new AppError("Application not found", 404); return result; }
  async issueGeneratedDocument(userId: string, role: "OFFICER" | "ADMIN", applicationId: string, authorization: string) { const application = await this.detail(userId, role, applicationId); if (application.status !== ApplicationStatus.APPROVED) throw new AppError("Completion certificates can be issued only for approved applications", 409); return this.generatedDocumentIssuer.issue(applicationId, authorization); }
  async reviewDocument(userId: string, role: "OFFICER" | "ADMIN", documentId: string, action: "VERIFY" | "REJECT" | "REQUEST_CORRECTION", note: string) { const existing = await this.repository.documentApplication(documentId); if (!existing) throw new AppError("Document not found", 404); if (role === "OFFICER") { const officer = await this.requireOfficer(userId); if (existing.assignedOfficerId !== officer.id) throw new AppError("Document not found", 404); } const result = await this.repository.reviewDocument(documentId, action, note); if (!result) throw new AppError("Document not found", 404); return result; }
  private async requireOfficer(userId: string) { const officer = await this.repository.findOfficerByUserId(userId); if (!officer) throw new AppError("Active officer profile not found", 403); return officer; }
}
