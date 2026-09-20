import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "../src/app";
import { errorHandler } from "../src/middleware/error-handler";
import { createRequireActiveAccount, requireAuth, requireRole } from "../src/middleware/require-auth";

const secret = "test-secret-that-is-at-least-thirty-two-characters-long";
const citizenToken = jwt.sign({ userId: "00000000-0000-4000-8000-000000000001", role: "CITIZEN" }, secret);

describe("employee route authorization", () => {
  it("rejects requests without a bearer token", async () => {
    const response = await request(app).get("/api/employee/applications");
    expect(response.status).toBe(401);
  });

  it("isolates citizen tokens from employee APIs before database access", async () => {
    const response = await request(app).get("/api/employee/applications").set("Authorization", `Bearer ${citizenToken}`);
    expect(response.status).toBe(403);
  });

  it("rejects citizen tokens from the employee dashboard", async () => {
    const response = await request(app).get("/api/employee/dashboard").set("Authorization", `Bearer ${citizenToken}`);
    expect(response.status).toBe(403);
  });

  it("rejects citizen tokens from detailed application review", async () => {
    const response = await request(app).get("/api/employee/applications/00000000-0000-4000-8000-000000000001/review").set("Authorization", `Bearer ${citizenToken}`);
    expect(response.status).toBe(403);
  });

  it("keeps the employee application-detail route mounted and protected", async () => {
    const response = await request(app).get("/api/employee/applications/00000000-0000-4000-8000-000000000001").set("Authorization", `Bearer ${citizenToken}`);
    expect(response.status).toBe(403);
  });

  it("rejects citizen tokens from identity verification review", async () => {
    const response = await request(app).patch("/api/employee/applications/00000000-0000-4000-8000-000000000001/identity-verifications/00000000-0000-4000-8000-000000000002/review").set("Authorization", `Bearer ${citizenToken}`).send({ action: "VERIFY", note: "Identity review completed" });
    expect(response.status).toBe(403);
  });

  it("rejects citizen tokens from completed-application listings", async () => {
    const response = await request(app).get("/api/employee/applications/completed").set("Authorization", `Bearer ${citizenToken}`);
    expect(response.status).toBe(403);
  });

  it("rejects citizen tokens from document-review APIs", async () => {
    const response = await request(app).patch("/api/employee/documents/00000000-0000-4000-8000-000000000001/review").set("Authorization", `Bearer ${citizenToken}`).send({ action: "VERIFY", note: "Manual review completed" });
    expect(response.status).toBe(403);
  });

  it("re-checks active status and role changes before employee actions", async () => {
    const protectedApp = express();
    let reached = false;
    protectedApp.get("/employee", requireAuth, createRequireActiveAccount(async (userId) => {
      if (userId === "inactive-admin") return { role: "ADMIN", isActive: false, officer: null };
      if (userId === "inactive-officer") return { role: "OFFICER", isActive: true, officer: { isActive: false } };
      return { role: "ADMIN", isActive: true, officer: null };
    }), requireRole("OFFICER", "ADMIN"), (_request, response) => { reached = true; response.status(200).send(); });
    protectedApp.use(errorHandler);

    const inactiveAdmin = jwt.sign({ userId: "inactive-admin", role: "ADMIN" }, secret);
    const inactiveOfficer = jwt.sign({ userId: "inactive-officer", role: "OFFICER" }, secret);
    const changedRole = jwt.sign({ userId: "changed-role", role: "OFFICER" }, secret);

    await request(protectedApp).get("/employee").set("Authorization", `Bearer ${inactiveAdmin}`).expect(401);
    await request(protectedApp).get("/employee").set("Authorization", `Bearer ${inactiveOfficer}`).expect(403);
    await request(protectedApp).get("/employee").set("Authorization", `Bearer ${changedRole}`).expect(401);
    expect(reached).toBe(false);
  });
});
