export type EmployeeRole = "OFFICER" | "ADMIN";

export interface EmployeeSession {
  userId: string;
  email: string;
  displayName: string | null;
  role: EmployeeRole;
  officer: {
    officerId: string;
    employeeIdentifier: string;
    department: string;
    designation: string;
  } | null;
}

const tokenKey = "janseva-x.employee.access-token";
const sessionKey = "janseva-x.employee.session";

function storage(): Storage | null {
  return typeof window === "undefined" ? null : window.sessionStorage;
}

export function getToken(): string | null {
  return storage()?.getItem(tokenKey) ?? null;
}

export function setToken(token: string): void {
  storage()?.setItem(tokenKey, token);
}

export function clearToken(): void {
  storage()?.removeItem(tokenKey);
}

function isEmployeeRole(value: unknown): value is EmployeeRole {
  return value === "OFFICER" || value === "ADMIN";
}

function isEmployeeSession(value: unknown): value is EmployeeSession {
  if (!value || typeof value !== "object") return false;
  const session = value as Record<string, unknown>;
  const officer = session.officer;

  return typeof session.userId === "string"
    && typeof session.email === "string"
    && (typeof session.displayName === "string" || session.displayName === null)
    && isEmployeeRole(session.role)
    && (officer === null || (
      typeof officer === "object"
      && typeof (officer as Record<string, unknown>).officerId === "string"
      && typeof (officer as Record<string, unknown>).employeeIdentifier === "string"
      && typeof (officer as Record<string, unknown>).department === "string"
      && typeof (officer as Record<string, unknown>).designation === "string"
    ));
}

export function getEmployeeSession(): EmployeeSession | null {
  const value = storage()?.getItem(sessionKey);
  if (!value) return null;

  try {
    const session: unknown = JSON.parse(value);
    if (isEmployeeSession(session)) return session;
  } catch {
    // A malformed prototype session is treated as signed out.
  }

  clearSession();
  return null;
}

export function setEmployeeSession(session: EmployeeSession): void {
  storage()?.setItem(sessionKey, JSON.stringify(session));
}

export function clearSession(): void {
  storage()?.removeItem(sessionKey);
}

export function isAuthenticated(): boolean {
  return Boolean(getToken() && getEmployeeSession());
}
