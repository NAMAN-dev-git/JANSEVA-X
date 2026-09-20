import { ExamApplicationStatus, Prisma } from "@prisma/client";
import { randomUUID } from "crypto";
import { prisma } from "../lib/prisma";
import { AppError } from "../utils/app-error";
import { ExamSubmissionService, type ExamSubmissionRequest } from "./exam-submission.service";

const applicationInclude = {
  exam: { include: { requirements: { orderBy: { sortOrder: "asc" } } } },
  documents: { include: { requirement: true, mockIssuedDocument: true }, orderBy: { attachedAt: "asc" } },
  timelineEvents: { orderBy: { sortOrder: "asc" } },
  reminder: true,
} satisfies Prisma.ExamApplicationInclude;

const timeline = [
  ["APPLICATION_SUBMITTED", "Application Submitted", "Completed", "2026-09-17", "COMPLETED"],
  ["PAYMENT_CONFIRMED", "Payment Confirmed", "Controlled DEMO payment recorded", "2026-09-17", "COMPLETED"],
  ["APPLICATION_ACCEPTED", "Application Accepted", "Prototype status update", "2026-09-18", "COMPLETED"],
  ["CORRECTION_WINDOW", "Correction Window", "20–25 October 2026", "2026-10-20", "UPCOMING"],
  ["CITY_SLIP", "Exam City Slip", "Expected DEMO information", "2026-12-01", "UPCOMING"],
  ["ADMIT_CARD", "Admit Card", "Expected DEMO admit card date", "2026-12-10", "UPCOMING"],
  ["EXAM_DATE", "Exam Date", "Fictional prototype exam date", "2026-12-15", "UPCOMING"],
  ["ANSWER_KEY", "Answer Key", "Expected DEMO release", "2026-12-22", "UPCOMING"],
  ["RESULT", "Result", "Expected DEMO release", "2027-01-15", "UPCOMING"],
] as const;

export class ExamService {
  private readonly submissionService = new ExamSubmissionService();
  async listExams() { return prisma.governmentExam.findMany({ where: { isDemo: true }, orderBy: { applicationStartDate: "asc" } }); }
  async getExam(examId: string) { const exam = await prisma.governmentExam.findFirst({ where: { id: examId, isDemo: true }, include: { requirements: { orderBy: { sortOrder: "asc" } } } }); if (!exam) throw new AppError("Government exam not found", 404); return exam; }

  async createDraft(userId: string, examId: string) {
    const citizen = await this.citizen(userId); await this.getExam(examId);
    return prisma.examApplication.upsert({ where: { citizenId_examId: { citizenId: citizen.id, examId } }, update: {}, create: { citizenId: citizen.id, examId, applicationNumber: `JX-EXAM-2026-${randomUUID().replaceAll("-", "").slice(0, 6).toUpperCase()}` }, include: applicationInclude });
  }
  async list(userId: string) { const citizen = await this.citizen(userId); return prisma.examApplication.findMany({ where: { citizenId: citizen.id }, include: applicationInclude, orderBy: { updatedAt: "desc" } }); }
  async get(userId: string, applicationId: string) { const citizen = await this.citizen(userId); return this.owned(citizen.id, applicationId); }
  async update(userId: string, applicationId: string, formData: Prisma.InputJsonValue) { const citizen = await this.citizen(userId); const application = await this.owned(citizen.id, applicationId); if (application.status !== ExamApplicationStatus.DRAFT && application.status !== ExamApplicationStatus.READY_FOR_SUBMISSION) throw new AppError("Submitted exam applications cannot be edited", 409); return prisma.examApplication.update({ where: { id: application.id }, data: { formData }, include: applicationInclude }); }

  async autoAttach(userId: string, applicationId: string) {
    const citizen = await this.citizen(userId); const application = await this.owned(citizen.id, applicationId);
    if (application.status === ExamApplicationStatus.SUBMITTED || application.status === ExamApplicationStatus.PAYMENT_CONFIRMED) throw new AppError("Submitted exam applications cannot change documents", 409);
    const demo = await prisma.demoCitizenProfile.findFirst({ where: { citizenProfileId: citizen.id, isDemo: true }, include: { issuedDocuments: true } });
    if (!demo) throw new AppError("Demo citizen profile not found", 404);
    const now = new Date(); const attached = [] as string[];
    for (const requirement of application.exam.requirements) {
      if (application.documents.some((document) => document.requirementId === requirement.id)) continue;
      const document = demo.issuedDocuments.find((item) => item.documentType === requirement.documentType && item.status === "AVAILABLE" && (!item.expiryDate || item.expiryDate >= now));
      if (document) { await prisma.examApplicationDocument.upsert({ where: { examApplicationId_requirementId: { examApplicationId: application.id, requirementId: requirement.id } }, update: {}, create: { examApplicationId: application.id, requirementId: requirement.id, mockIssuedDocumentId: document.id } }); attached.push(requirement.name); }
    }
    return { application: await this.owned(citizen.id, applicationId), attached };
  }

  async validate(userId: string, applicationId: string) {
    const application = await this.get(userId, applicationId); const data = (application.formData ?? {}) as Record<string, unknown>;
    const missingFields = ["fullName", "dateOfBirth", "gender", "mobile", "email", "address", "qualification", "examRegion", "examCity"].filter((key) => typeof data[key] !== "string" || !String(data[key]).trim());
    const attachedIds = new Set(application.documents.map((document) => document.requirementId));
    const missingRequirements = application.exam.requirements.filter((requirement) => requirement.isRequired && !attachedIds.has(requirement.id)).map((requirement) => ({ requirementId: requirement.id, name: requirement.name, documentType: requirement.documentType, issuableServiceSlug: requirement.issuableServiceSlug }));
    return { valid: missingFields.length === 0 && missingRequirements.length === 0, missingFields, missingRequirements };
  }

  async submit(userId: string, request: ExamSubmissionRequest) { return this.submissionService.submit(userId, request); }
  async submitLegacy(userId: string, applicationId: string) { return this.submissionService.submitLegacy(userId, applicationId); }

  async setReminder(userId: string, applicationId: string) { const citizen = await this.citizen(userId); const application = await this.owned(citizen.id, applicationId); const admitCard = application.timelineEvents.find((event) => event.eventType === "ADMIT_CARD"); if (!admitCard) throw new AppError("Admit card timeline information is not available", 409); return prisma.examReminder.upsert({ where: { examApplicationId: application.id }, update: { enabled: true, targetDate: admitCard.targetDate }, create: { examApplicationId: application.id, reminderType: "ADMIT_CARD", targetDate: admitCard.targetDate, enabled: true } }); }

  private async citizen(userId: string) { const citizen = await prisma.citizenProfile.findUnique({ where: { userId } }); if (!citizen) throw new AppError("Citizen profile not found", 404); return citizen; }
  private async owned(citizenId: string, applicationId: string) { const application = await prisma.examApplication.findFirst({ where: { id: applicationId, citizenId }, include: applicationInclude }); if (!application) throw new AppError("Exam application not found", 404); return application; }
}
