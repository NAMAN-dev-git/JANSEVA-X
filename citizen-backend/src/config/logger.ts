import morgan from "morgan";
import { env } from "./env";

export const requestLogger = morgan(env.NODE_ENV === "production" ? "combined" : "dev", {
  skip: (request) => request.url?.startsWith("/api/health") ?? false,
});

export function logError(error: unknown): void {
  if (env.NODE_ENV === "test") {
    return;
  }

  if (env.NODE_ENV === "production") {
    console.error("Application error", { timestamp: new Date().toISOString() });
    return;
  }

  console.error(error);
}
