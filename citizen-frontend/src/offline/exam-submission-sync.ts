import { citizenApi } from "../api/citizen";
import { ApiError } from "../api/client";
import type { ExamLocalSyncState, ExamSubmissionIntent, ExamSubmissionReceipt, ExamSubmissionResult } from "../types/api";
import { getSubmissionIntent, getSubmissionIntentsForApplication, getSubmissionIntentsForUser, saveSubmissionIntent } from "./exam-offline-db";

const activeStates: ExamLocalSyncState[] = ["QUEUED_OFFLINE", "SYNCING", "RETRY_SCHEDULED", "AUTH_REQUIRED"];
const inFlightByUser = new Map<string, Promise<ExamSubmissionIntent[]>>();

function now(): string { return new Date().toISOString(); }
function receiptSummary(receipt: ExamSubmissionReceipt | null): ExamSubmissionIntent["receipt"] {
  return receipt ? {
    receiptId: receipt.receiptId,
    serverReceivedAt: receipt.serverReceivedAt,
    serverAcceptedAt: receipt.serverAcceptedAt,
    deadlineAssessment: receipt.deadlineAssessment,
    failureCode: receipt.failureCode,
    status: receipt.status,
  } : null;
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(String(value));
}

export async function canonicalPayloadHash(payload: { applicationId: string; formData: Record<string, unknown>; documentRequirementIds: string[]; confirmed: boolean }): Promise<string> {
  if (!crypto?.subtle) throw new Error("This browser cannot securely create an offline submission hash.");
  const canonical = canonicalize({ ...payload, documentRequirementIds: [...payload.documentRequirementIds].sort() });
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function queueExamSubmissionIntent(input: { userId: string; applicationId: string; formData: Record<string, unknown>; documentRequirementIds: string[]; confirmed: boolean }): Promise<ExamSubmissionIntent> {
  const payloadHash = await canonicalPayloadHash({ applicationId: input.applicationId, formData: input.formData, documentRequirementIds: input.documentRequirementIds, confirmed: input.confirmed });
  const existing = (await getSubmissionIntentsForApplication(input.userId, input.applicationId)).find((intent) => activeStates.includes(intent.syncState));
  if (existing) {
    if (existing.payloadHash === payloadHash) return existing;
    throw new Error("A queued submission already exists for this application. Wait for it to finish or resolve its server result before changing the submission.");
  }
  const capturedAt = now();
  const intent: ExamSubmissionIntent = {
    userId: input.userId,
    applicationId: input.applicationId,
    idempotencyKey: crypto.randomUUID(),
    payloadHash,
    clientCapturedAt: capturedAt,
    createdAt: capturedAt,
    syncState: "QUEUED_OFFLINE",
    attemptCount: 0,
    lastAttemptAt: null,
    nextAttemptAt: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    receipt: null,
  };
  await saveSubmissionIntent(intent);
  notify(intent);
  return intent;
}

function notify(intent: ExamSubmissionIntent): void {
  window.dispatchEvent(new CustomEvent("janseva-exam-offline-updated", { detail: { applicationId: intent.applicationId, userId: intent.userId, syncState: intent.syncState } }));
}

function nextRetry(attemptCount: number): string {
  const base = Math.min(5 * 60_000, 5_000 * 2 ** Math.min(attemptCount, 6));
  const jitter = Math.round(base * (Math.random() * 0.2));
  return new Date(Date.now() + base + jitter).toISOString();
}

function isRetryable(error: ApiError): boolean { return error.status === 0 || error.status === 429 || [500, 502, 503, 504].includes(error.status); }
function asResult(value: unknown): ExamSubmissionResult | null {
  if (!value || typeof value !== "object") return null;
  const result = value as Partial<ExamSubmissionResult>;
  return typeof result.accepted === "boolean" ? result as ExamSubmissionResult : null;
}

async function persist(intent: ExamSubmissionIntent): Promise<ExamSubmissionIntent> { await saveSubmissionIntent(intent); notify(intent); return intent; }

async function synchronizeOne(intent: ExamSubmissionIntent): Promise<ExamSubmissionIntent> {
  const current = await getSubmissionIntent(intent.idempotencyKey);
  if (!current || !activeStates.includes(current.syncState)) return current ?? intent;
  const syncing = await persist({ ...current, syncState: "SYNCING", attemptCount: current.attemptCount + 1, lastAttemptAt: now(), nextAttemptAt: null, lastErrorCode: null, lastErrorMessage: null });
  try {
    const result = await citizenApi.submitExamApplicationIntent(syncing.applicationId, {
      idempotencyKey: syncing.idempotencyKey,
      clientCapturedAt: syncing.clientCapturedAt,
      payloadHash: syncing.payloadHash,
    });
    if (result.accepted && result.receipt?.status === "ACCEPTED") {
      return persist({ ...syncing, syncState: "SERVER_CONFIRMED", receipt: receiptSummary(result.receipt), nextAttemptAt: null });
    }
    return persist({ ...syncing, syncState: "PERMANENT_FAILURE", receipt: receiptSummary(result.receipt), lastErrorCode: result.receipt?.failureCode ?? "SERVER_REJECTED", lastErrorMessage: "The JANSEVA-X server rejected this submission. No payment was processed.", nextAttemptAt: null });
  } catch (caught) {
    const error = caught instanceof ApiError ? caught : new ApiError(caught instanceof Error ? caught.message : "Submission could not be synchronized.", 0);
    const result = asResult(error.details);
    if (error.status === 401) return persist({ ...syncing, syncState: "AUTH_REQUIRED", lastErrorCode: "AUTH_REQUIRED", lastErrorMessage: "Sign in again before this saved submission can be sent.", nextAttemptAt: null });
    if (isRetryable(error)) return persist({ ...syncing, syncState: "RETRY_SCHEDULED", lastErrorCode: String(error.status || "NETWORK"), lastErrorMessage: error.message, nextAttemptAt: nextRetry(syncing.attemptCount) });
    return persist({ ...syncing, syncState: "PERMANENT_FAILURE", receipt: receiptSummary(result?.receipt ?? null), lastErrorCode: result?.receipt?.failureCode ?? String(error.status), lastErrorMessage: result?.receipt?.failureCode ? "The JANSEVA-X server rejected this submission. No payment was processed." : error.message, nextAttemptAt: null });
  }
}

export async function synchronizeQueuedExamSubmissions(userId: string, force = false): Promise<ExamSubmissionIntent[]> {
  if (navigator.onLine === false) return getSubmissionIntentsForUser(userId);
  const existing = inFlightByUser.get(userId);
  if (existing) return existing;
  const work = (async () => {
    const intents = await getSubmissionIntentsForUser(userId);
    const due = intents.filter((intent) => activeStates.includes(intent.syncState) && (force || !intent.nextAttemptAt || new Date(intent.nextAttemptAt).getTime() <= Date.now()));
    const results: ExamSubmissionIntent[] = [];
    for (const intent of due) results.push(await synchronizeOne(intent));
    return results;
  })();
  inFlightByUser.set(userId, work);
  try { return await work; } finally { inFlightByUser.delete(userId); }
}

export async function getCurrentExamSubmissionIntent(userId: string, applicationId: string): Promise<ExamSubmissionIntent | null> {
  const intents = await getSubmissionIntentsForApplication(userId, applicationId);
  return intents.sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ?? null;
}
