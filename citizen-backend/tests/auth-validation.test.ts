import express from "express";
import jwt, { type SignOptions } from "jsonwebtoken";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "../src/app";
import { env } from "../src/config/env";
import { errorHandler } from "../src/middleware/error-handler";
import { requireAuth, requireRole } from "../src/middleware/require-auth";
import { demoLoginRequestSchema, loginRequestSchema, registerRequestSchema } from "../src/validators/auth.validators";

describe("authentication request validation", () => {
  it("rejects an invalid email and weak password", () => {
    const invalidEmail = registerRequestSchema.safeParse({ body: { email: "not-an-email", password: "StrongPassword123!", fullName: "Demo Citizen" }, params: {}, query: {} });
    const weakPassword = registerRequestSchema.safeParse({ body: { email: "citizen@jansevax.test", password: "weak", fullName: "Demo Citizen" }, params: {}, query: {} });

    expect(invalidEmail.success).toBe(false);
    expect(weakPassword.success).toBe(false);
  });

  it("does not accept an empty login password", () => {
    expect(loginRequestSchema.safeParse({ body: { email: "citizen@jansevax.test", password: "" }, params: {}, query: {} }).success).toBe(false);
  });

  it("accepts only a ten-digit demo mobile and six-digit demo OTP", () => {
    expect(demoLoginRequestSchema.safeParse({ body: { mobile: "9000000001", otp: "123456" }, params: {}, query: {} }).success).toBe(true);
    expect(demoLoginRequestSchema.safeParse({ body: { mobile: "9000000001", otp: "12345" }, params: {}, query: {} }).success).toBe(false);
    expect(demoLoginRequestSchema.safeParse({ body: { mobile: "900000001", otp: "123456" }, params: {}, query: {} }).success).toBe(false);
  });
});

describe("requireAuth", () => {
  const protectedApp = express();
  protectedApp.get("/protected", requireAuth, requireRole("CITIZEN"), (request, response) => response.json({ userId: request.auth!.userId }));
  protectedApp.use(errorHandler);

  it("rejects missing, invalid, and expired access tokens", async () => {
    const expiredToken = jwt.sign({ userId: "user-id", role: "CITIZEN" }, env.JWT_SECRET, { expiresIn: -1 } as SignOptions);

    await request(protectedApp).get("/protected").expect(401);
    await request(protectedApp).get("/protected").set("Authorization", "Bearer invalid-token").expect(401);
    await request(protectedApp).get("/protected").set("Authorization", `Bearer ${expiredToken}`).expect(401);
  });

  it("rejects unauthenticated citizen profile requests before database access", async () => {
    await request(app).get("/api/citizen/profile").expect(401);
    await request(app).patch("/api/citizen/profile").send({ fullName: "Attempted Update" }).expect(401);
  });
});
