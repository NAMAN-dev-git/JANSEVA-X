import { ApplicationStatus } from "@prisma/client";
import { AppError } from "../utils/app-error";

export function assertCitizenStatusTransition(currentStatus: ApplicationStatus, nextStatus: ApplicationStatus): void {
  if (currentStatus === ApplicationStatus.DRAFT && nextStatus === ApplicationStatus.SUBMITTED) {
    return;
  }

  throw new AppError(`Citizen status transition from ${currentStatus} to ${nextStatus} is not available`, 409);
}

/** A verification service transition, distinct from a citizen editing/submission action. */
export function assertIdentityVerificationTransition(currentStatus: ApplicationStatus, nextStatus: ApplicationStatus): void {
  if (currentStatus === ApplicationStatus.SUBMITTED && nextStatus === ApplicationStatus.IDENTITY_VERIFIED) return;
  throw new AppError(`Identity verification transition from ${currentStatus} to ${nextStatus} is not available`, 409);
}
