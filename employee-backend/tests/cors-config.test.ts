import { describe, expect, it } from "vitest";
import { parseCorsOrigins, resolveCorsOrigin } from "../src/config/env";

describe("employee CORS configuration", () => {
  it("requires an explicit production allow-list", () => {
    expect(() => resolveCorsOrigin(undefined, "production")).toThrow("must be explicitly configured");
    expect(resolveCorsOrigin(undefined, "development")).toBe("http://localhost:5174");
  });

  it("rejects an empty or wildcard production allow-list", () => {
    expect(() => parseCorsOrigins(" , ", "production")).toThrow("at least one explicit origin");
    expect(() => parseCorsOrigins("*", "production")).toThrow("CORS_ORIGIN cannot include *");
    expect(parseCorsOrigins("https://employee.example, https://admin.example", "production")).toEqual([
      "https://employee.example",
      "https://admin.example",
    ]);
  });
});
