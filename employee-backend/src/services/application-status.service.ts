import { ApplicationStatus } from "@prisma/client";
import { AppError } from "../utils/app-error";
const transitions: Partial<Record<ApplicationStatus, ApplicationStatus[]>> = {
  [ApplicationStatus.SUBMITTED]: [ApplicationStatus.UNDER_REVIEW],
  [ApplicationStatus.UNDER_REVIEW]: [ApplicationStatus.CORRECTION_REQUIRED, ApplicationStatus.APPROVED, ApplicationStatus.REJECTED],
  [ApplicationStatus.APPROVED]: [ApplicationStatus.SIGNED],
  [ApplicationStatus.SIGNED]: [ApplicationStatus.COMPLETED],
};
export function assertEmployeeTransition(current: ApplicationStatus, next: ApplicationStatus): void { if (!transitions[current]?.includes(next)) throw new AppError(`Status transition from ${current} to ${next} is not available`, 409); }
