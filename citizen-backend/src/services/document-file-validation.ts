import type { Express } from "express";
import path from "path";
import { AppError } from "../utils/app-error";

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 20_000_000;

const allowedFiles: Record<string, ReadonlySet<string>> = {
  "application/pdf": new Set([".pdf"]),
  "image/jpeg": new Set([".jpg", ".jpeg"]),
  "image/png": new Set([".png"]),
};

export function assertValidDocumentFile(file: Express.Multer.File): void {
  const extension = path.extname(file.originalname).toLowerCase();
  if (!allowedFiles[file.mimetype]?.has(extension)) throw new AppError("Only PDF, JPG, JPEG, and PNG files are supported", 400);
  if (file.size > MAX_DOCUMENT_BYTES) throw new AppError("Uploaded file exceeds the 10 MB limit", 413);
  if (!hasExpectedSignature(file.buffer, file.mimetype)) throw new AppError("File content does not match its declared document type", 400);
  if (file.mimetype !== "application/pdf") assertImageDimensions(file.buffer, file.mimetype);
}

export function hasExpectedSignature(contents: Buffer, mimeType: string): boolean {
  if (mimeType === "application/pdf") return contents.subarray(0, 5).toString("ascii") === "%PDF-" && contents.subarray(Math.max(0, contents.length - 1024)).includes(Buffer.from("%%EOF"));
  if (mimeType === "image/png") return contents.length >= 24 && contents.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) && contents.subarray(12, 16).toString("ascii") === "IHDR";
  return mimeType === "image/jpeg" && contents.length >= 3 && contents[0] === 0xff && contents[1] === 0xd8 && contents[2] === 0xff;
}

export function assertImageDimensions(contents: Buffer, mimeType: string): void {
  const dimensions = imageDimensions(contents, mimeType);
  if (!dimensions || dimensions.width < 1 || dimensions.height < 1) throw new AppError("Image content is malformed", 400);
  if (dimensions.width * dimensions.height > MAX_IMAGE_PIXELS) throw new AppError("Image dimensions exceed the document processing limit", 422);
}

function imageDimensions(contents: Buffer, mimeType: string): { width: number; height: number } | null {
  if (mimeType === "image/png") return { width: contents.readUInt32BE(16), height: contents.readUInt32BE(20) };
  let offset = 2;
  while (offset + 9 < contents.length) {
    if (contents[offset] !== 0xff) return null;
    const marker = contents[offset + 1];
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9) continue;
    const segmentLength = contents.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > contents.length) return null;
    if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
      return { height: contents.readUInt16BE(offset + 3), width: contents.readUInt16BE(offset + 5) };
    }
    offset += segmentLength;
  }
  return null;
}
