import type { TokenPair } from "../types/api";

// Vite exposes VITE_* variables to the browser at build/dev-server startup.
// Leave VITE_API_URL unset for same-laptop development; set it to the laptop's
// LAN-reachable backend URL when opening the frontend from a phone.
const API_BASE_URL = String(import.meta.env.VITE_API_URL || "").trim().replace(/\/+$/, "") || "http://localhost:4000/api";
const storageKey = "janseva-x.tokens";

export class ApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly details?: unknown) { super(message); }
}

type ApiOptions = Omit<RequestInit, "body"> & { body?: BodyInit | Record<string, unknown>; skipAuth?: boolean; retry?: boolean };

export function getTokens(): TokenPair | null {
  try { return JSON.parse(localStorage.getItem(storageKey) ?? "null") as TokenPair | null; } catch { return null; }
}
export function setTokens(tokens: TokenPair): void { localStorage.setItem(storageKey, JSON.stringify(tokens)); }
export function clearTokens(): void { localStorage.removeItem(storageKey); window.dispatchEvent(new Event("janseva-auth-expired")); }

async function refreshTokens(): Promise<TokenPair> {
  const tokens = getTokens();
  if (!tokens?.refreshToken) throw new ApiError("Your session has expired. Please sign in again.", 401);
  let response: Response;
  try { response = await fetch(`${API_BASE_URL}/auth/refresh`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refreshToken: tokens.refreshToken }) }); }
  catch { throw new ApiError("Network error. Check that the citizen backend is running and try again.", 0); }
  const payload = await response.json().catch(() => null) as { data?: { tokens?: TokenPair }; error?: { message?: string } } | null;
  if (!response.ok || !payload?.data?.tokens) throw new ApiError(payload?.error?.message ?? "Your session has expired. Please sign in again.", response.status);
  setTokens(payload.data.tokens);
  return payload.data.tokens;
}

export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { body, skipAuth, retry, headers, ...init } = options;
  const token = skipAuth ? null : getTokens()?.accessToken;
  const isFormData = body instanceof FormData;
  const requestHeaders = new Headers(headers);
  if (token) requestHeaders.set("Authorization", `Bearer ${token}`);
  if (body && !isFormData && typeof body !== "string" && !requestHeaders.has("Content-Type")) requestHeaders.set("Content-Type", "application/json");
  const requestBody = body && !isFormData && typeof body !== "string" ? JSON.stringify(body) : body;
  let response: Response;
  try { response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers: requestHeaders, body: requestBody }); }
  catch { throw new ApiError("Network error. Check that the citizen backend is running and try again.", 0); }
  if (response.status === 401 && !skipAuth && !retry && getTokens()?.refreshToken) {
    try { await refreshTokens(); return api<T>(path, { ...options, retry: true }); }
    catch (error) { clearTokens(); throw error; }
  }
  if (response.status === 204) return undefined as T;
  const payload = await response.json().catch(() => null) as { success?: boolean; data?: T; error?: { message?: string; details?: unknown } } | null;
  if (!response.ok || !payload?.success) throw new ApiError(payload?.error?.message ?? "The request could not be completed.", response.status, payload?.error?.details);
  return payload.data as T;
}

export async function download(path: string, retried = false): Promise<Blob> {
  const token = getTokens()?.accessToken;
  let response: Response;
  try { response = await fetch(`${API_BASE_URL}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} }); }
  catch { throw new ApiError("Network error. Check that the citizen backend is running and try again.", 0); }
  if (response.status === 401 && !retried && getTokens()?.refreshToken) {
    try { await refreshTokens(); return download(path, true); }
    catch (error) { clearTokens(); throw error; }
  }
  if (response.status === 401) { clearTokens(); throw new ApiError("Your session has expired. Please sign in again.", 401); }
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null;
    throw new ApiError(payload?.error?.message ?? "The document could not be downloaded.", response.status);
  }
  return response.blob();
}

export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url);
}
