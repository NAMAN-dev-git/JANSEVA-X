import { ApplicationStatus } from "@prisma/client";
import { AppError } from "../utils/app-error";

export function assertCitizenStatusTransition(currentStatus: ApplicationStatus, nextStatus: ApplicationStatus): void {
  if (currentStatus === ApplicationStatus.DRAFT && nextStatus === ApplicationStatus.SUBMITTED) {
    return;
  }

  throw new AppError(`Citizen status transition from ${currentStatus} to ${nextStatus} is not available`, 409);
}
