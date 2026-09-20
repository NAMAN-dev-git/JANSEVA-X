import type { ExamOfflineDraft, ExamSubmissionIntent } from "../types/api";

const DATABASE_NAME = "janseva-x-exam-offline-v1";
const DATABASE_VERSION = 1;
const DRAFTS = "examDrafts";
const INTENTS = "submissionIntents";

export class OfflineStorageError extends Error {
  constructor(message: string, public readonly causeName?: string) { super(message); this.name = "OfflineStorageError"; }
}

function unavailable(): OfflineStorageError { return new OfflineStorageError("Offline storage is unavailable in this browser."); }
function storageError(error: unknown): OfflineStorageError {
  const name = error instanceof DOMException ? error.name : undefined;
  if (name === "QuotaExceededError") return new OfflineStorageError("This device has no space available for the exam offline draft.", name);
  return new OfflineStorageError("The exam offline draft could not be saved on this device.", name);
}

function openDatabase(): Promise<IDBDatabase> {
  if (!("indexedDB" in window)) return Promise.reject(unavailable());
  return new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest;
    try { request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION); } catch (error) { reject(storageError(error)); return; }
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(DRAFTS)) {
        const drafts = database.createObjectStore(DRAFTS, { keyPath: ["userId", "applicationId"] });
        drafts.createIndex("byUser", "userId", { unique: false });
        drafts.createIndex("byUserUpdated", ["userId", "localUpdatedAt"], { unique: false });
      }
      if (!database.objectStoreNames.contains(INTENTS)) {
        const intents = database.createObjectStore(INTENTS, { keyPath: "idempotencyKey" });
        intents.createIndex("byUserApplication", ["userId", "applicationId"], { unique: false });
        intents.createIndex("byUserStateNext", ["userId", "syncState", "nextAttemptAt"], { unique: false });
        intents.createIndex("byUser", "userId", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(storageError(request.error));
    request.onblocked = () => reject(new OfflineStorageError("Offline storage is busy in another browser tab. Close that tab and try again."));
  });
}

async function withStore<T>(storeName: string, mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const database = await openDatabase();
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const transaction = database.transaction(storeName, mode);
      const store = transaction.objectStore(storeName);
      let request: IDBRequest<T> | void;
      try { request = operation(store); } catch (error) { reject(storageError(error)); return; }
      if (request) request.onsuccess = () => resolve(request.result);
      transaction.oncomplete = () => resolve(undefined);
      transaction.onerror = () => reject(storageError(transaction.error));
      transaction.onabort = () => reject(storageError(transaction.error));
    });
  } finally { database.close(); }
}

export async function getExamOfflineDraft(userId: string, applicationId: string): Promise<ExamOfflineDraft | null> {
  return (await withStore<ExamOfflineDraft>(DRAFTS, "readonly", (store) => store.get([userId, applicationId]))) ?? null;
}

export async function saveExamOfflineDraft(draft: ExamOfflineDraft): Promise<void> {
  await withStore(DRAFTS, "readwrite", (store) => store.put(draft));
}

export async function deleteExamOfflineDraft(userId: string, applicationId: string): Promise<void> {
  await withStore(DRAFTS, "readwrite", (store) => store.delete([userId, applicationId]));
}

export async function getSubmissionIntent(idempotencyKey: string): Promise<ExamSubmissionIntent | null> {
  return (await withStore<ExamSubmissionIntent>(INTENTS, "readonly", (store) => store.get(idempotencyKey))) ?? null;
}

export async function saveSubmissionIntent(intent: ExamSubmissionIntent): Promise<void> {
  await withStore(INTENTS, "readwrite", (store) => store.put(intent));
}

export async function getSubmissionIntentsForApplication(userId: string, applicationId: string): Promise<ExamSubmissionIntent[]> {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(INTENTS, "readonly");
      const index = transaction.objectStore(INTENTS).index("byUserApplication");
      const request = index.getAll(IDBKeyRange.only([userId, applicationId]));
      request.onsuccess = () => resolve(request.result as ExamSubmissionIntent[]);
      request.onerror = () => reject(storageError(request.error));
      transaction.onerror = () => reject(storageError(transaction.error));
    });
  } finally { database.close(); }
}

export async function getSubmissionIntentsForUser(userId: string): Promise<ExamSubmissionIntent[]> {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(INTENTS, "readonly");
      const request = transaction.objectStore(INTENTS).index("byUser").getAll(IDBKeyRange.only(userId));
      request.onsuccess = () => resolve(request.result as ExamSubmissionIntent[]);
      request.onerror = () => reject(storageError(request.error));
      transaction.onerror = () => reject(storageError(transaction.error));
    });
  } finally { database.close(); }
}

export async function deleteSubmissionIntent(idempotencyKey: string): Promise<void> {
  await withStore(INTENTS, "readwrite", (store) => store.delete(idempotencyKey));
}

async function deleteByUser(store: IDBObjectStore, indexName: string, userId: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = store.index(indexName).openCursor(IDBKeyRange.only(userId));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) { resolve(); return; }
      cursor.delete(); cursor.continue();
    };
    request.onerror = () => reject(storageError(request.error));
  });
}

/** Explicit logout only: remove the current citizen's local exam records. */
export async function purgeExamOfflineRecordsForUser(userId: string): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction([DRAFTS, INTENTS], "readwrite");
      void deleteByUser(transaction.objectStore(DRAFTS), "byUser", userId)
        .then(() => deleteByUser(transaction.objectStore(INTENTS), "byUser", userId))
        .catch(reject);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(storageError(transaction.error));
      transaction.onabort = () => reject(storageError(transaction.error));
    });
  } finally { database.close(); }
}
