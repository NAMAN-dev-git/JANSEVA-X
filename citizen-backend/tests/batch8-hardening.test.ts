import express from "express";
import jwt, { type SignOptions } from "jsonwebtoken";
import { ApplicationStatus } from "@prisma/client";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { env, parseCorsOrigins } from "../src/config/env";
import { errorHandler } from "../src/middleware/error-handler";
import { createRequireActiveAccount, requireAuth, requireRole } from "../src/middleware/require-auth";
import { assertCitizenCompletionTransition, assertCitizenStatusTransition, assertGeneratedDocumentSigningTransition, assertIdentityVerificationTransition } from "../src/services/application-status.service";

function token(role: "CITIZEN" | "OFFICER" = "CITIZEN") {
  return jwt.sign({ userId: "user-1", role }, env.JWT_SECRET, { expiresIn: "1h" } as SignOptions);
}

describe("Batch 8 active-account authorization", () => {
  it("rejects inactive or role-changed users before protected access", async () => {
    const protectedApp = express();
    protectedApp.get("/citizen", requireAuth, createRequireActiveAccount(async () => ({ role: "CITIZEN", isActive: false, officer: null })), requireRole("CITIZEN"), (_request, response) => response.status(200).send());
    protectedApp.get("/changed-role", requireAuth, createRequireActiveAccount(async () => ({ role: "OFFICER", isActive: true, officer: { isActive: true } })), requireRole("CITIZEN"), (_request, response) => response.status(200).send());
    protectedApp.use(errorHandler);

    await request(protectedApp).get("/citizen").set("Authorization", `Bearer ${token()}`).expect(401);
    await request(protectedApp).get("/changed-role").set("Authorization", `Bearer ${token()}`).expect(401);
  });

  it("rejects an inactive officer before the demo issuance role gate", async () => {
    const protectedApp = express();
    protectedApp.get("/issue", requireAuth, createRequireActiveAccount(async () => ({ role: "OFFICER", isActive: true, officer: { isActive: false } })), requireRole("OFFICER"), (_request, response) => response.status(200).send());
    protectedApp.use(errorHandler);

    await request(protectedApp).get("/issue").set("Authorization", `Bearer ${token("OFFICER")}`).expect(403);
  });
});

describe("Batch 8 configuration and conflict responses", () => {
  it("rejects a production wildcard CORS origin while preserving explicit origins", () => {
    expect(() => parseCorsOrigins("*", "production")).toThrow("CORS_ORIGIN cannot include *");
    expect(parseCorsOrigins("https://citizen.example, https://admin.example", "production")).toEqual(["https://citizen.example", "https://admin.example"]);
  });

  it("returns a retryable conflict response for exhausted serializable transactions", async () => {
    const conflictApp = express();
    conflictApp.get("/conflict", (_request, _response, next) => next(new PrismaClientKnownRequestError("serialization conflict", { code: "P2034", clientVersion: "test" })));
    conflictApp.use(errorHandler);

    const response = await request(conflictApp).get("/conflict").expect(409);
    expect(response.body.error.message).toContain("retry");
  });
});

describe("Batch 8 controlled end-to-end workflow fixture", () => {
  it("keeps approval external while verifying the citizen lifecycle sequence", () => {
    const statuses = [ApplicationStatus.DRAFT];

    // Documents are uploaded/analyzed while DRAFT by the document-service tests.
    assertIdentityVerificationTransition(ApplicationStatus.DRAFT, ApplicationStatus.IDENTITY_VERIFIED);
    statuses.push(ApplicationStatus.IDENTITY_VERIFIED);
    assertCitizenStatusTransition(ApplicationStatus.IDENTITY_VERIFIED, ApplicationStatus.SUBMITTED);
    statuses.push(ApplicationStatus.SUBMITTED);

    // This fixture represents the external/officer review boundary; no citizen API performs it.
    statuses.push(ApplicationStatus.APPROVED);
    assertGeneratedDocumentSigningTransition(ApplicationStatus.APPROVED, ApplicationStatus.SIGNED);
    statuses.push(ApplicationStatus.SIGNED);
    assertCitizenCompletionTransition(ApplicationStatus.SIGNED, ApplicationStatus.COMPLETED);
    statuses.push(ApplicationStatus.COMPLETED);

    expect(statuses).toEqual([
      ApplicationStatus.DRAFT,
      ApplicationStatus.IDENTITY_VERIFIED,
      ApplicationStatus.SUBMITTED,
      ApplicationStatus.APPROVED,
      ApplicationStatus.SIGNED,
      ApplicationStatus.COMPLETED,
    ]);
  });
});
