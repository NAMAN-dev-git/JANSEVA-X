import jwt from "jsonwebtoken";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "../src/app";

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
});
