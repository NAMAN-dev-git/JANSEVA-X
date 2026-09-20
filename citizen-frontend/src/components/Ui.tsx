import type { ApplicationStatus } from "../types/api";

export function Loading({ label = "Loading" }: { label?: string }) { return <div className="state-card" role="status"><span className="spinner" />{label}...</div>; }
export function ErrorMessage({ message }: { message: string }) { return <div className="message error" role="alert">{message}</div>; }
export function SuccessMessage({ message }: { message: string }) { return <div className="message success" role="status">{message}</div>; }
export function EmptyState({ title, text, action }: { title: string; text: string; action?: React.ReactNode }) { return <section className="empty-state"><h2>{title}</h2><p>{text}</p>{action}</section>; }

const statusText: Record<ApplicationStatus, string> = {
  DRAFT: "Draft", IDENTITY_VERIFIED: "Identity verified (demo)", SUBMITTED: "Submitted - awaiting external review", DOCUMENTS_VERIFIED: "Documents verified - external workflow", UNDER_REVIEW: "Under review - external workflow", CORRECTION_REQUIRED: "Correction required - external workflow", APPROVED: "Approved - awaiting demo completion certificate", REJECTED: "Rejected - external workflow", SIGNED: "Demo certificate mock-signed", COMPLETED: "Completed (demo workflow)",
};
export function StatusBadge({ status }: { status: ApplicationStatus | string }) { return <span className={`status status-${status.toLowerCase()}`}>{statusText[status as ApplicationStatus] ?? status}</span>; }
export function DemoNotice({ children = "This is a JANSEVA-X demo/prototype flow. It does not connect to government systems." }: { children?: React.ReactNode }) { return <div className="demo-notice"><strong>Demo / prototype</strong><span>{children}</span></div>; }
export function formatDate(value?: string | null): string { return value ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Not available"; }

function fieldLabel(field: string): string {
  return field.replace(/([a-z])([A-Z])/g, "$1 $2").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function fieldValue(value: unknown): React.ReactNode {
  if (value === null || value === undefined || value === "") return "Not provided";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.length ? value.map((item) => typeof item === "string" || typeof item === "number" ? String(item) : "Provided item").join(", ") : "None";
  return "Provided";
}

/** A citizen-facing form summary; API payload JSON is never rendered. */
export function DataSummary({ data, emptyMessage = "No information has been provided." }: { data?: Record<string, unknown> | null; emptyMessage?: string }) {
  const fields = Object.entries(data ?? {});
  if (!fields.length) return <p>{emptyMessage}</p>;
  return <dl className="field-list">{fields.map(([field, value]) => <div key={field}><dt>{fieldLabel(field)}</dt><dd>{fieldValue(value)}</dd></div>)}</dl>;
}
