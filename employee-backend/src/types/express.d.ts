declare global { namespace Express { interface Request { requestId?: string; auth?: { userId: string; role: "CITIZEN" | "OFFICER" | "ADMIN" }; validated?: { body?: unknown; params?: unknown; query?: unknown }; } } }
export {};
