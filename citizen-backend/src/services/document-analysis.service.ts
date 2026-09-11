import { z } from "zod";

export const documentTypes = ["AADHAAR", "PAN", "TRADE_LICENCE", "INCOME_CERTIFICATE", "DOMICILE_CERTIFICATE", "BIRTH_CERTIFICATE", "PROPERTY_DOCUMENT", "OTHER", "UNKNOWN"] as const;
export type DocumentType = (typeof documentTypes)[number];

const nullableText = z.string().max(500).nullable();
export const documentAnalysisSchema = z.object({
  documentType: z.enum(documentTypes),
  confidence: z.number().min(0).max(1),
  fields: z.object({
    fullName: nullableText,
    dateOfBirth: nullableText,
    address: nullableText,
    documentNumber: nullableText,
    businessName: nullableText,
    phone: nullableText,
    issueDate: nullableText,
    expiryDate: nullableText,
  }).strict(),
  missingFields: z.array(z.string().max(300)).max(30),
  detectedIssues: z.array(z.string().max(500)).max(30),
  signatureDetected: z.enum(["DETECTED", "NOT_DETECTED", "NOT_AVAILABLE"]),
  sealDetected: z.enum(["DETECTED", "NOT_DETECTED", "NOT_AVAILABLE"]),
  isReadable: z.boolean(),
  recommendation: z.string().max(500),
}).strict();
export type DocumentAnalysis = z.infer<typeof documentAnalysisSchema>;

export interface DocumentAnalysisInput {
  ocrText: string;
  originalFilename: string;
  expectedDocumentType?: DocumentType;
  applicationData?: unknown;
  requiredDocumentNames: string[];
}

export interface DocumentAnalysisProvider {
  analyze(input: DocumentAnalysisInput): Promise<DocumentAnalysis>;
}

export function documentTypeForRequirement(requirementName: string): DocumentType | null {
  const value = requirementName.toLowerCase();
  if (/aadhaar|uidai/.test(value)) return "AADHAAR";
  if (/\bpan\b|permanent account/.test(value)) return "PAN";
  if (/trade licen[cs]e/.test(value)) return "TRADE_LICENCE";
  if (/income certificate/.test(value)) return "INCOME_CERTIFICATE";
  if (/domicile|residence certificate/.test(value)) return "DOMICILE_CERTIFICATE";
  if (/birth certificate/.test(value)) return "BIRTH_CERTIFICATE";
  if (/property|sale deed|lease deed/.test(value)) return "PROPERTY_DOCUMENT";
  return null;
}

export class DeterministicDocumentAnalysisProvider implements DocumentAnalysisProvider {
  async analyze(input: DocumentAnalysisInput): Promise<DocumentAnalysis> {
    const text = input.ocrText.slice(0, 100_000);
    const documentType = detectDocumentType(text, input.originalFilename, input.expectedDocumentType);
    const fields = extractFields(text, documentType);
    const missingFields = requiredFields(documentType).filter((field) => fields[field] === null).map((field) => `Missing expected field: ${field}`);
    const detectedIssues = [
      ...detectTypeIssue(input.expectedDocumentType, documentType),
      ...detectApplicationMismatches(fields, input.applicationData),
      ...input.requiredDocumentNames.map((name) => `Required document not provided: ${name}`),
    ];
    const isReadable = text.trim().length >= 3;
    if (!isReadable) detectedIssues.unshift("No readable text was extracted from the document");
    const confidence = isReadable ? Math.min(0.85, 0.35 + Object.values(fields).filter(Boolean).length * 0.08) : 0;
    const analysis = {
      documentType,
      confidence,
      fields,
      missingFields,
      detectedIssues,
      signatureDetected: "NOT_AVAILABLE" as const,
      sealDetected: "NOT_AVAILABLE" as const,
      isReadable,
      recommendation: detectedIssues.length > 0
        ? "DEMO/PROTOTYPE deterministic analysis found items requiring citizen or manual review; it does not verify authenticity."
        : "DEMO/PROTOTYPE deterministic analysis found no obvious consistency issue; it does not verify authenticity.",
    };
    return documentAnalysisSchema.parse(analysis);
  }
}

export function detectDocumentType(text: string, filename = "", expected?: DocumentType): DocumentType {
  const value = `${text}\n${filename}`.toLowerCase();
  if (/aadhaar|uidai|unique identification authority/.test(value)) return "AADHAAR";
  if (/permanent account number|income tax department/.test(value) || /\b[a-z]{5}\d{4}[a-z]\b/i.test(text)) return "PAN";
  if (/trade licen[cs]e/.test(value)) return "TRADE_LICENCE";
  if (/income certificate/.test(value)) return "INCOME_CERTIFICATE";
  if (/domicile certificate|residence certificate/.test(value)) return "DOMICILE_CERTIFICATE";
  if (/birth certificate|certificate of birth/.test(value)) return "BIRTH_CERTIFICATE";
  if (/property|sale deed|lease deed/.test(value)) return "PROPERTY_DOCUMENT";
  return expected && expected !== "UNKNOWN" ? expected : "UNKNOWN";
}

function extractFields(text: string, documentType: DocumentType): DocumentAnalysis["fields"] {
  const labeled = (labels: string[]) => captureLabeled(text, labels);
  const pan = text.match(/\b[A-Z]{5}\d{4}[A-Z]\b/);
  const aadhaar = text.match(/\b\d{4}[ -]?\d{4}[ -]?\d{4}\b/);
  const phone = text.match(/(?:\+91[ -]?)?[6-9]\d{9}\b/);
  const date = (labels: string[]) => normalizeDate(labeled(labels));
  return {
    fullName: labeled(["name", "full name", "applicant name"]),
    dateOfBirth: date(["date of birth", "dob", "birth date"]),
    address: labeled(["address", "residential address"]),
    documentNumber: documentType === "PAN" ? pan?.[0] ?? null : documentType === "AADHAAR" ? aadhaar?.[0]?.replace(/[ -]/g, "") ?? null : labeled(["document number", "certificate number", "licence number", "license number"]),
    businessName: labeled(["business name", "trade name", "establishment name"]),
    phone: phone?.[0]?.replace(/[ -]/g, "") ?? null,
    issueDate: date(["issue date", "date of issue", "issued on"]),
    expiryDate: date(["expiry date", "valid until", "valid upto", "valid up to"]),
  };
}

function captureLabeled(text: string, labels: string[]): string | null {
  const escaped = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const match = text.match(new RegExp(`(?:^|\\n)\\s*(?:${escaped})\\s*[:\\-]\\s*([^\\n]{2,120})`, "im"));
  return match?.[1]?.trim() || null;
}

function normalizeDate(value: string | null): string | null {
  if (!value) return null;
  const match = value.match(/\b(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}|\d{4}[\/-]\d{1,2}[\/-]\d{1,2})\b/);
  return match?.[1] ?? null;
}

function requiredFields(type: DocumentType): Array<keyof DocumentAnalysis["fields"]> {
  if (type === "AADHAAR") return ["fullName", "documentNumber"];
  if (type === "PAN") return ["fullName", "documentNumber"];
  if (type === "TRADE_LICENCE") return ["businessName", "documentNumber"];
  return [];
}

function detectTypeIssue(expected: DocumentType | undefined, detected: DocumentType): string[] {
  return expected && expected !== "UNKNOWN" && detected !== "UNKNOWN" && expected !== detected
    ? [`Document type mismatch: expected ${expected}, detected ${detected}`]
    : [];
}

function detectApplicationMismatches(fields: DocumentAnalysis["fields"], applicationData: unknown): string[] {
  if (!applicationData || typeof applicationData !== "object" || Array.isArray(applicationData)) return [];
  const record = applicationData as Record<string, unknown>;
  const comparisons: Array<[keyof DocumentAnalysis["fields"], string[]]> = [
    ["fullName", ["fullName", "applicantName", "name"]],
    ["dateOfBirth", ["dateOfBirth", "dob"]],
    ["address", ["address"]],
    ["businessName", ["businessName", "tradeName"]],
  ];
  return comparisons.flatMap(([field, keys]) => {
    const documentValue = fields[field];
    const applicationValue = keys.map((key) => record[key]).find((value) => typeof value === "string") as string | undefined;
    return documentValue && applicationValue && normalize(documentValue) !== normalize(applicationValue) ? [`${field} does not match application data`] : [];
  });
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}
