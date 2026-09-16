import { ApplicationStatus, OfficerReviewStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { EmployeeService } from "../src/services/employee.service";

const officer = { id: "officer-1", userId: "user-1", isActive: true, user: { id: "user-1", role: "OFFICER", isActive: true } };
const application = { id: "application-1", status: ApplicationStatus.UNDER_REVIEW, assignedOfficerId: "officer-1", reviewStatus: OfficerReviewStatus.IN_REVIEW };

describe("EmployeeService workflow guards", () => {
  it("maps a conditional claim conflict to 409", async () => {
    const repository: any = { findOfficerByUserId: async () => officer, claim: async () => null };
    const service = new EmployeeService(repository);
    await expect(service.claimApplication("user-1", "application-1")).rejects.toMatchObject({ statusCode: 409 });
  });

  it("requires assignment before an officer can decide", async () => {
    const repository: any = { findApplication: async () => ({ ...application, assignedOfficerId: "different-officer" }), findOfficerByUserId: async () => officer };
    const service = new EmployeeService(repository);
    await expect(service.decision("user-1", "OFFICER", "application-1", ApplicationStatus.APPROVED, "All required review checks completed")).rejects.toMatchObject({ statusCode: 404 });
  });

  it("rejects invalid employee decisions before repository mutation", async () => {
    let mutationCalled = false;
    const repository: any = { findApplication: async () => ({ ...application, status: ApplicationStatus.SUBMITTED }), findOfficerByUserId: async () => officer, decide: async () => { mutationCalled = true; return application; } };
    const service = new EmployeeService(repository);
    await expect(service.decision("user-1", "OFFICER", "application-1", ApplicationStatus.APPROVED, "Invalid shortcut")).rejects.toMatchObject({ statusCode: 409 });
    expect(mutationCalled).toBe(false);
  });

  it("returns the repository-confirmed employee decision", async () => {
    const confirmed = { ...application, status: ApplicationStatus.APPROVED, reviewedAt: new Date() };
    const repository: any = { findApplication: async () => application, findOfficerByUserId: async () => officer, decide: async () => confirmed };
    const service = new EmployeeService(repository);
    await expect(service.decision("user-1", "OFFICER", "application-1", ApplicationStatus.APPROVED, "Manual review approved")).resolves.toBe(confirmed);
  });
});
