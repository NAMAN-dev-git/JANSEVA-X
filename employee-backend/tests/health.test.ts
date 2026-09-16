import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "../src/app";
describe("employee health", () => { it("returns the health response", async () => { const response = await request(app).get("/api/health"); expect(response.status).toBe(200); expect(response.body).toMatchObject({ success: true, service: "JANSEVA-X Employee Backend", environment: "test" }); }); });
