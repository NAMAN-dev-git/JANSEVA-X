import { app } from "../src/app";

// Vercel invokes the existing Express application directly for every /api/*
// route. Keep HTTP startup in src/server.ts for local development only.
export default app;
