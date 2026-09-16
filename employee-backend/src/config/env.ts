import dotenv from "dotenv";
import { z } from "zod";
dotenv.config();
const parsed = z.object({ NODE_ENV: z.enum(["development", "test", "production"]).default("development"), PORT: z.coerce.number().int().min(1).max(65535).default(4001), DATABASE_URL: z.string().url(), JWT_SECRET: z.string().min(32), JWT_EXPIRES_IN: z.string().min(1).default("1d"), CORS_ORIGIN: z.string().min(1).default("http://localhost:5174") }).safeParse(process.env);
if (!parsed.success) throw new Error(`Invalid environment configuration: ${parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`);
export const env = parsed.data;
export const corsOrigins = env.CORS_ORIGIN.split(",").map((value) => value.trim()).filter(Boolean);
