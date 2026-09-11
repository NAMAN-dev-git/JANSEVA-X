import { recognize } from "tesseract.js";
import { AppError } from "../utils/app-error";
import { assertImageDimensions } from "./document-file-validation";

const MAX_CONCURRENT_OCR = 2;
const OCR_TIMEOUT_MS = 30_000;
const MAX_PDF_PAGES = 20;
const MAX_OCR_TEXT_LENGTH = 100_000;
let activeOcrJobs = 0;
const ocrQueue: Array<() => void> = [];

export interface OcrProvider {
  extract(input: { contents: Buffer; mimeType: string }): Promise<string>;
}

/** Uses embedded PDF text when available; image OCR is performed by Tesseract.js. */
export class TesseractOcrProvider implements OcrProvider {
  async extract(input: { contents: Buffer; mimeType: string }): Promise<string> {
    await acquireOcrSlot();
    const task = this.extractWithinLimits(input);
    void task.finally(releaseOcrSlot).catch(() => undefined);
    try {
      return await withTimeout(task, OCR_TIMEOUT_MS);
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError("OCR could not process this document", 422);
    }
  }

  private async extractWithinLimits(input: { contents: Buffer; mimeType: string }): Promise<string> {
    if (input.mimeType === "application/pdf") {
      const pdf = require("pdf-parse/lib/pdf-parse.js") as (contents: Buffer) => Promise<{ text: string; numpages: number }>;
      const result = await pdf(input.contents);
      if (result.numpages > MAX_PDF_PAGES) throw new AppError(`PDF exceeds the ${MAX_PDF_PAGES}-page processing limit`, 422);
      return limitText(result.text);
    }
    assertImageDimensions(input.contents, input.mimeType);
    const result = await recognize(input.contents, "eng");
    return limitText(result.data.text);
  }
}

function limitText(text: string): string {
  if (text.length > MAX_OCR_TEXT_LENGTH) throw new AppError("OCR output exceeds the document processing limit", 422);
  return text.trim();
}

function acquireOcrSlot(): Promise<void> {
  if (activeOcrJobs < MAX_CONCURRENT_OCR) { activeOcrJobs += 1; return Promise.resolve(); }
  return new Promise((resolve) => ocrQueue.push(() => { activeOcrJobs += 1; resolve(); }));
}

function releaseOcrSlot(): void {
  activeOcrJobs -= 1;
  ocrQueue.shift()?.();
}

function withTimeout<T>(task: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    task,
    new Promise<T>((_resolve, reject) => setTimeout(() => reject(new AppError(`OCR exceeded the ${timeoutMs / 1000}-second processing limit`, 422)), timeoutMs)),
  ]);
}
