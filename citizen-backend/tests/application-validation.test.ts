import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "../src/app";
import { createApplicationRequestSchema, updateApplicationRequestSchema } from "../src/validators/application.validators";

describe("application request validation", () => {
  const validServiceId = "72bc96e1-01a4-4c7c-8b1f-0896e559c8b9";
  const validApplicationId = "e1529f39-9841-496a-9395-fce72b638dc8";

  it("rejects invalid application input and client-controlled fields", () => {
    expect(createApplicationRequestSchema.safeParse({ body: { serviceId: "invalid" }, params: {}, query: {} }).success).toBe(false);
    expect(createApplicationRequestSchema.safeParse({ body: { serviceId: validServiceId, citizenId: "other-citizen" }, params: {}, query: {} }).success).toBe(false);
    expect(updateApplicationRequestSchema.safeParse({ body: { status: "SUBMITTED" }, params: { applicationId: validApplicationId }, query: {} }).success).toBe(false);
  });

  it("rejects invalid applicationData and accepts a controlled JSON object", () => {
    expect(updateApplicationRequestSchema.safeParse({ body: { applicationData: [] }, params: { applicationId: validApplicationId }, query: {} }).success).toBe(false);
    expect(updateApplicationRequestSchema.safeParse({ body: { applicationData: { businessName: "Demo Store", nested: { address: "Demo Address" } } }, params: { applicationId: validApplicationId }, query: {} }).success).toBe(true);
  });
});

describe("application route authentication", () => {
  it("rejects unauthenticated application endpoints", async () => {
    await request(app).get("/api/applications").expect(401);
    await request(app).post("/api/applications").send({ serviceId: "72bc96e1-01a4-4c7c-8b1f-0896e559c8b9" }).expect(401);
    await request(app).get("/api/applications/e1529f39-9841-496a-9395-fce72b638dc8").expect(401);
    await request(app).post("/api/applications/e1529f39-9841-496a-9395-fce72b638dc8/documents").expect(401);
    await request(app).post("/api/documents/e1529f39-9841-496a-9395-fce72b638dc8/analyze").expect(401);
    await request(app).delete("/api/documents/e1529f39-9841-496a-9395-fce72b638dc8").expect(401);
  });
});
