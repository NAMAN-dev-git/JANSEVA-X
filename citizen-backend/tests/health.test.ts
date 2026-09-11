import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "../src/app";

describe("GET /api/health", () => {
  it("returns the backend health response", async () => {
    const response = await request(app).get("/api/health");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ success: true, service: "JANSEVA-X Citizen Backend", status: "healthy", environment: "test" });
    expect(response.headers["x-request-id"]).toBeDefined();
  });
});
