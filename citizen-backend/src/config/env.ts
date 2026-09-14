import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z.string().url("DATABASE_URL must be a valid PostgreSQL connection URL"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must contain at least 32 characters"),
  JWT_EXPIRES_IN: z.string().min(1).default("1d"),
  REFRESH_TOKEN_EXPIRES_IN_DAYS: z.coerce.number().int().positive().max(90).default(7),
  CORS_ORIGIN: z.string().min(1).default("http://localhost:5173"),
  UPLOAD_DIR: z.string().min(1).default("uploads"),
  MAX_FILE_SIZE_MB: z.coerce.number().positive().max(100).default(10),
  DEMO_DOCUMENT_ISSUER_ENABLED: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
});

const parsedEnvironment = environmentSchema.safeParse(process.env);

if (!parsedEnvironment.success) {
  const errors = parsedEnvironment.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
  throw new Error(`Invalid environment configuration: ${errors}`);
}

export const env = parsedEnvironment.data;

export function parseCorsOrigins(value: string, nodeEnv: "development" | "test" | "production" = env.NODE_ENV): string[] {
  const origins = value.split(",").map((origin) => origin.trim()).filter(Boolean);
  if (nodeEnv === "production" && origins.includes("*")) throw new Error("CORS_ORIGIN cannot include * in production when credentials are enabled");
  return origins;
}

export const corsOrigins = parseCorsOrigins(env.CORS_ORIGIN);
