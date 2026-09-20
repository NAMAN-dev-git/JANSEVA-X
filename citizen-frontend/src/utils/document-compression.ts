export type DocumentCompressionStatus =
  | "COMPRESSED"
  | "SKIPPED_UNSUPPORTED"
  | "SKIPPED_SMALL_FILE"
  | "SKIPPED_NOT_SMALLER"
  | "SKIPPED_UNAVAILABLE"
  | "FAILED";

export interface DocumentCompressionResult {
  file: File;
  originalSize: number;
  status: DocumentCompressionStatus;
}

const MINIMUM_COMPRESSIBLE_BYTES = 512 * 1024;
const MAX_JPEG_DIMENSION = 2560;
const JPEG_QUALITY = 0.85;
const handledFiles = new WeakMap<File, DocumentCompressionResult>();

function result(file: File, status: Exclude<DocumentCompressionStatus, "COMPRESSED">): DocumentCompressionResult {
  const value = { file, originalSize: file.size, status };
  handledFiles.set(file, value);
  return value;
}

function targetDimensions(width: number, height: number): { width: number; height: number } {
  const scale = Math.min(1, MAX_JPEG_DIMENSION / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
}

/**
 * Safely reduces large JPEG uploads without changing their upload contract.
 * PDF and PNG files are intentionally passed through: native browser APIs do
 * not provide a reliable, contract-preserving compression path for them.
 */
export async function compressDocumentForUpload(file: File): Promise<DocumentCompressionResult> {
  const handled = handledFiles.get(file);
  if (handled) return handled;
  if (file.type !== "image/jpeg") return result(file, "SKIPPED_UNSUPPORTED");
  if (file.size < MINIMUM_COMPRESSIBLE_BYTES) return result(file, "SKIPPED_SMALL_FILE");
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") return result(file, "SKIPPED_UNAVAILABLE");

  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const dimensions = targetDimensions(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;
    const context = canvas.getContext("2d");
    if (!context) return result(file, "SKIPPED_UNAVAILABLE");
    context.drawImage(bitmap, 0, 0, dimensions.width, dimensions.height);
    const compressedBlob = await canvasToJpeg(canvas);
    if (!compressedBlob || compressedBlob.size >= file.size) return result(file, "SKIPPED_NOT_SMALLER");

    const compressed = new File([compressedBlob], file.name, { type: file.type, lastModified: file.lastModified });
    const compressedResult = { file: compressed, originalSize: file.size, status: "COMPRESSED" as const };
    handledFiles.set(file, compressedResult);
    handledFiles.set(compressed, compressedResult);
    return compressedResult;
  } catch {
    return result(file, "FAILED");
  } finally {
    bitmap?.close();
  }
}

export function compressionSummary(compression: DocumentCompressionResult): string | null {
  if (compression.status !== "COMPRESSED") return null;
  return `Reduced from ${(compression.originalSize / 1024).toFixed(1)} KB to ${(compression.file.size / 1024).toFixed(1)} KB before upload.`;
}
