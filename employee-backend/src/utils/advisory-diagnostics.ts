export interface AdvisoryDiagnostics {
  documentType: string;
  confidence: number;
  missingFields: string[];
  detectedIssues: string[];
  signatureDetected: "DETECTED" | "NOT_DETECTED" | "NOT_AVAILABLE";
  sealDetected: "DETECTED" | "NOT_DETECTED" | "NOT_AVAILABLE";
  isReadable: boolean;
  recommendation: string;
  advisory: "DEMO/PROTOTYPE — requires authorized human review; it never determines an application outcome.";
}

const detectionStates = new Set(["DETECTED", "NOT_DETECTED", "NOT_AVAILABLE"]);

export function presentAdvisoryDiagnostics(value: unknown): AdvisoryDiagnostics | null {
  if (!isRecord(value) || !isRecord(value.analysis)) return null;
  const analysis = value.analysis;
  if (
    !isBoundedString(analysis.documentType, 150)
    || typeof analysis.confidence !== "number" || !Number.isFinite(analysis.confidence) || analysis.confidence < 0 || analysis.confidence > 1
    || !isBoundedStringArray(analysis.missingFields, 30, 300)
    || !isBoundedStringArray(analysis.detectedIssues, 30, 500)
    || !isDetectionState(analysis.signatureDetected)
    || !isDetectionState(analysis.sealDetected)
    || typeof analysis.isReadable !== "boolean"
    || !isBoundedString(analysis.recommendation, 500)
  ) return null;
  return {
    documentType: analysis.documentType,
    confidence: analysis.confidence,
    missingFields: analysis.missingFields,
    detectedIssues: analysis.detectedIssues,
    signatureDetected: analysis.signatureDetected,
    sealDetected: analysis.sealDetected,
    isReadable: analysis.isReadable,
    recommendation: analysis.recommendation,
    advisory: "DEMO/PROTOTYPE — requires authorized human review; it never determines an application outcome.",
  };
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function isBoundedString(value: unknown, maximum: number): value is string { return typeof value === "string" && value.length <= maximum; }
function isBoundedStringArray(value: unknown, maximumItems: number, maximumLength: number): value is string[] { return Array.isArray(value) && value.length <= maximumItems && value.every((item) => isBoundedString(item, maximumLength)); }
function isDetectionState(value: unknown): value is AdvisoryDiagnostics["signatureDetected"] { return typeof value === "string" && detectionStates.has(value); }
