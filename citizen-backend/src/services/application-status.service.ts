import { ApplicationStatus } from "@prisma/client";
import { AppError } from "../utils/app-error";

export function assertCitizenStatusTransition(currentStatus: ApplicationStatus, nextStatus: ApplicationStatus): void {
  if (currentStatus === ApplicationStatus.IDENTITY_VERIFIED && nextStatus === ApplicationStatus.SUBMITTED) {
    return;
  }

  throw new AppError(`Citizen status transition from ${currentStatus} to ${nextStatus} is not available`, 409);
}

/** A verification service transition, distinct from a citizen editing/submission action. */
export function assertIdentityVerificationTransition(currentStatus: ApplicationStatus, nextStatus: ApplicationStatus): void {
  if (currentStatus === ApplicationStatus.DRAFT && nextStatus === ApplicationStatus.IDENTITY_VERIFIED) return;
  throw new AppError(`Identity verification transition from ${currentStatus} to ${nextStatus} is not available`, 409);
}

/** Server-side completion workflow transition after all required generated documents are mock-signed. */
export function assertGeneratedDocumentSigningTransition(currentStatus: ApplicationStatus, nextStatus: ApplicationStatus): void {
  if (currentStatus === ApplicationStatus.APPROVED && nextStatus === ApplicationStatus.SIGNED) return;
  throw new AppError(`Generated-document signing transition from ${currentStatus} to ${nextStatus} is not available`, 409);
}

/** The citizen may acknowledge completion only after the server has recorded signed output. */
export function assertCitizenCompletionTransition(currentStatus: ApplicationStatus, nextStatus: ApplicationStatus): void {
  if (currentStatus === ApplicationStatus.SIGNED && nextStatus === ApplicationStatus.COMPLETED) return;
  throw new AppError(`Citizen completion transition from ${currentStatus} to ${nextStatus} is not available`, 409);
}
