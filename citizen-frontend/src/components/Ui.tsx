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
