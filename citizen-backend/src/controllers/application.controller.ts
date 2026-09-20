import type { Request, Response } from "express";
import { ApplicationService } from "../services/application.service";
import { ApplicationSubmissionService, type SubmissionTicket } from "../services/application-submission.service";
import type { CreateApplicationRequestBody, ListApplicationsRequestQuery, SubmitApplicationRequestBody, UpdateApplicationRequestBody } from "../validators/application.validators";
import { presentApplicationDetails, presentApplicationSummary, presentService } from "../utils/application-response";

const applicationService = new ApplicationService();
const applicationSubmissionService = new ApplicationSubmissionService();

export async function createApplication(request: Request, response: Response): Promise<void> {
  const application = await applicationService.createDraft(request.auth!.userId, request.validated!.body as CreateApplicationRequestBody);
  response.status(201).json({ success: true, data: { application: presentApplicationSummary(application) } });
}

export async function listApplications(request: Request, response: Response): Promise<void> {
  const query = request.validated!.query as ListApplicationsRequestQuery;
  const result = await applicationService.listCitizenApplications(request.auth!.userId, query);
  response.status(200).json({
    success: true,
    data: {
      applications: result.applications.map(presentApplicationSummary),
      pagination: { page: result.page, limit: result.limit, total: result.total, totalPages: result.totalPages },
    },
  });
}

export async function getApplication(request: Request, response: Response): Promise<void> {
  const applicationId = (request.validated!.params as { applicationId: string }).applicationId;
  const application = await applicationService.getCitizenApplication(request.auth!.userId, applicationId);
  response.status(200).json({ success: true, data: { application: presentApplicationDetails(application) } });
}

export async function updateApplication(request: Request, response: Response): Promise<void> {
  const applicationId = (request.validated!.params as { applicationId: string }).applicationId;
  const { applicationData } = request.validated!.body as UpdateApplicationRequestBody;
  const application = await applicationService.updateDraft(request.auth!.userId, applicationId, applicationData);
  response.status(200).json({ success: true, data: { application: presentApplicationDetails(application) } });
}

export async function submitApplication(request: Request, response: Response): Promise<void> {
  const applicationId = (request.validated!.params as { applicationId: string }).applicationId;
  const body = request.validated!.body as SubmitApplicationRequestBody;
  const result = await applicationSubmissionService.submit(request.auth!.userId, { applicationId, idempotencyKey: body.idempotencyKey });
  response.status(200).json({
    success: true,
    data: {
      applicationId: result.application.id,
      status: result.application.status,
      submittedAt: result.application.submittedAt,
      service: presentService(result.application.service),
      submissionTicket: presentSubmissionTicket(result.ticket),
    },
  });
}

export async function getSubmissionTicket(request: Request, response: Response): Promise<void> {
  const applicationId = (request.validated!.params as { applicationId: string }).applicationId;
  const ticket = await applicationSubmissionService.getTicket(request.auth!.userId, applicationId);
  response.status(200).json({ success: true, data: { submissionTicket: presentSubmissionTicket(ticket) } });
}

export async function retrySubmissionTicket(request: Request, response: Response): Promise<void> {
  const applicationId = (request.validated!.params as { applicationId: string }).applicationId;
  const ticket = await applicationSubmissionService.retryTicket(request.auth!.userId, applicationId);
  response.status(200).json({ success: true, data: { submissionTicket: presentSubmissionTicket(ticket) } });
}

export async function getApplicationHistory(request: Request, response: Response): Promise<void> {
  const applicationId = (request.validated!.params as { applicationId: string }).applicationId;
  const history = await applicationService.getHistory(request.auth!.userId, applicationId);
  response.status(200).json({
    success: true,
    data: { history: history.map((entry) => ({ status: entry.status, note: entry.note, createdAt: entry.createdAt })) },
  });
}

export function presentSubmissionTicket(ticket: SubmissionTicket) {
  return {
    ticketId: ticket.id,
    applicationId: ticket.applicationId,
    processingState: ticket.status,
    attemptCount: ticket.attemptCount,
    createdAt: ticket.createdAt,
    processingStartedAt: ticket.processingStartedAt,
    completedAt: ticket.completedAt,
    failedAt: ticket.failedAt,
    failureReason: ticket.lastError,
  };
}
