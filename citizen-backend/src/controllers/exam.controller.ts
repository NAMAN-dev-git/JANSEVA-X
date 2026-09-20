import type { Request, Response } from "express";
import { ExamService } from "../services/exam.service";
import type { ExamSubmissionRequestBody } from "../validators/exam.validators";
const service = new ExamService();
const id = (request: Request, key: "examId" | "applicationId") => (request.validated!.params as Record<string, string>)[key];
export async function listExams(_request: Request, response: Response) { response.json({ success: true, data: { exams: await service.listExams() } }); }
export async function getExam(request: Request, response: Response) { response.json({ success: true, data: { exam: await service.getExam(id(request, "examId")) } }); }
export async function createExamApplication(request: Request, response: Response) { response.status(201).json({ success: true, data: { application: await service.createDraft(request.auth!.userId, (request.validated!.body as { examId: string }).examId) } }); }
export async function listExamApplications(request: Request, response: Response) { response.json({ success: true, data: { applications: await service.list(request.auth!.userId) } }); }
export async function getExamApplication(request: Request, response: Response) { response.json({ success: true, data: { application: await service.get(request.auth!.userId, id(request, "applicationId")) } }); }
export async function updateExamApplication(request: Request, response: Response) { response.json({ success: true, data: { application: await service.update(request.auth!.userId, id(request, "applicationId"), (request.validated!.body as { formData: never }).formData) } }); }
export async function autoAttachExamDocuments(request: Request, response: Response) { response.json({ success: true, data: await service.autoAttach(request.auth!.userId, id(request, "applicationId")) }); }
export async function validateExamApplication(request: Request, response: Response) { response.json({ success: true, data: await service.validate(request.auth!.userId, id(request, "applicationId")) }); }
function presentSubmissionResult(result: Awaited<ReturnType<ExamService["submit"]>>) {
  return {
    application: result.application,
    receipt: result.receipt ? {
      receiptId: result.receipt.id,
      applicationId: result.receipt.applicationId,
      idempotencyKey: result.receipt.idempotencyKey,
      payloadHash: result.receipt.payloadHash,
      clientCapturedAt: result.receipt.clientCapturedAt,
      serverReceivedAt: result.receipt.serverReceivedAt,
      serverAcceptedAt: result.receipt.serverAcceptedAt,
      deadlineAtSnapshot: result.receipt.deadlineAtSnapshot,
      deadlineAssessment: result.receipt.deadlineAssessment,
      status: result.receipt.status,
      deliveryAttemptCount: result.receipt.deliveryAttemptCount,
      lastDeliveryAt: result.receipt.lastDeliveryAt,
      failureCode: result.receipt.failureCode,
    } : null,
    accepted: result.accepted,
    stableFinalResult: result.stableFinalResult,
    demoPrototypePolicy: result.demoPrototypePolicy,
    governmentAccepted: false,
    mode: "DEMO/PROTOTYPE",
    payment: result.accepted ? "Controlled DEMO payment recorded after server-side acceptance; no real payment was processed" : "No payment was processed",
  };
}

export async function createExamSubmission(request: Request, response: Response) {
  const body = request.validated!.body as ExamSubmissionRequestBody;
  const result = await service.submit(request.auth!.userId, { applicationId: id(request, "applicationId"), ...body });
  response.status(result.accepted ? 200 : 409).json({ success: result.accepted, data: presentSubmissionResult(result) });
}

// The legacy route remains body-less for current callers, but executes the
// same durable idempotent service using a server-created compatibility key.
export async function submitExamApplication(request: Request, response: Response) {
  const result = await service.submitLegacy(request.auth!.userId, id(request, "applicationId"));
  response.status(result.accepted ? 200 : 409).json({ success: result.accepted, data: presentSubmissionResult(result) });
}
export async function setExamReminder(request: Request, response: Response) { response.json({ success: true, data: { reminder: await service.setReminder(request.auth!.userId, id(request, "applicationId")) } }); }
