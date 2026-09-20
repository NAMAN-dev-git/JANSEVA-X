import dotenv from "dotenv";
import { z } from "zod";
dotenv.config();
const parsed = z.object({ NODE_ENV: z.enum(["development", "test", "production"]).default("development"), PORT: z.coerce.number().int().min(1).max(65535).default(4001), DATABASE_URL: z.string().url(), JWT_SECRET: z.string().min(32), JWT_EXPIRES_IN: z.string().min(1).default("1d"), CORS_ORIGIN: z.string().min(1).default("http://localhost:5174"), CITIZEN_BACKEND_API_URL: z.string().url().default("http://localhost:4000/api") }).safeParse(process.env);
if (!parsed.success) throw new Error(`Invalid environment configuration: ${parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`);

const defaultDevelopmentCorsOrigin = "http://localhost:5174";

/** Production must declare an explicit browser-origin allow-list rather than inheriting a local default. */
export function resolveCorsOrigin(value: string | undefined, nodeEnv: "development" | "test" | "production"): string {
  const configured = value?.trim();
  if (configured) return configured;
  if (nodeEnv === "production") throw new Error("CORS_ORIGIN must be explicitly configured in production");
  return defaultDevelopmentCorsOrigin;
}

export const env = {
  ...parsed.data,
  CORS_ORIGIN: resolveCorsOrigin(process.env.CORS_ORIGIN, parsed.data.NODE_ENV),
};

export function parseCorsOrigins(value: string, nodeEnv: "development" | "test" | "production" = env.NODE_ENV): string[] {
  const origins = value.split(",").map((origin) => origin.trim()).filter(Boolean);
  if (nodeEnv === "production" && origins.length === 0) throw new Error("CORS_ORIGIN must include at least one explicit origin in production");
  if (nodeEnv === "production" && origins.includes("*")) throw new Error("CORS_ORIGIN cannot include * in production when credentials are enabled");
  return origins;
}

export const corsOrigins = parseCorsOrigins(env.CORS_ORIGIN);
