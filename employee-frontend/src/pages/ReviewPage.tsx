import { useMemo, useState } from "react";
import { EmployeeHeader } from "../components/EmployeeHeader";
import { ApiError, employeeApi, type EmployeeDecisionStatus } from "../lib/api";
import { useApplicationReview } from "../hooks/useApplicationReview";

type DecisionIntent = "APPROVED" | "CORRECTION_REQUIRED" | "REJECTED";

interface ReviewPageProps {
  applicationId: string | null;
  onNavigateIdentityVerification: () => void;
  onNavigateApplicationDetails: () => void;
  onNavigateApplications: () => void;
  onNavigateCompleted: () => void;
  onNavigateProfile: () => void;
  onNavigateDashboard: () => void;
  onSessionExpired: () => void;
  onReturnToLogin: () => void;
}

const decisionContent: Record<DecisionIntent, { title: string; body: string; confirm: string }> = {
  APPROVED: { title: "Approve this prototype application?", body: "This records an authorized DEMO / PROTOTYPE officer decision. It does not create a government decision, issue a certificate, or complete citizen-owned mock signing.", confirm: "Record approval" },
  CORRECTION_REQUIRED: { title: "Request correction for this prototype application?", body: "This records a correction-required employee decision. The citizen remediation and resubmission lifecycle is not implemented in this batch.", confirm: "Record correction request" },
  REJECTED: { title: "Reject this prototype application?", body: "This records an authorized DEMO / PROTOTYPE rejection decision. It does not connect to a government registry or create a real government outcome.", confirm: "Record rejection" },
};

function decisionLabel(status: EmployeeDecisionStatus): string {
  if (status === "CORRECTION_REQUIRED") return "Correction required";
  return status[0] + status.slice(1).toLowerCase();
}

function latestHistorySummary(review: ReturnType<typeof useApplicationReview>["review"]): string {
  const latest = review?.history.at(-1);
  if (!latest) return "No status-history entry is available.";
  const note = latest.note ? ` — ${latest.note.slice(0, 140)}${latest.note.length > 140 ? "…" : ""}` : "";
  return `Latest status history: ${latest.status}${note}`;
}

export function ReviewPage({ applicationId, onNavigateIdentityVerification, onNavigateApplicationDetails, onNavigateApplications, onNavigateCompleted, onNavigateProfile, onNavigateDashboard, onSessionExpired, onReturnToLogin }: ReviewPageProps) {
  const { review, isLoading, error, refresh } = useApplicationReview(applicationId, onSessionExpired);
  const [intent, setIntent] = useState<DecisionIntent | null>(null);
  const [note, setNote] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isDeciding, setIsDeciding] = useState(false);
  const [isIssuing, setIsIssuing] = useState(false);
  const [issuanceError, setIssuanceError] = useState<string | null>(null);
  const activeDecision = intent ? decisionContent[intent] : null;
  const diagnosticCount = useMemo(() => review?.documents.filter((document) => document.diagnostics).length ?? 0, [review]);
  const canStartReview = review?.status === "SUBMITTED" && review.reviewStatus === "ASSIGNED";
  const canDecide = review?.status === "UNDER_REVIEW";
  const terminalDecision = review?.status === "APPROVED" || review?.status === "CORRECTION_REQUIRED" || review?.status === "REJECTED" ? review.status : null;

  async function startReview(): Promise<void> {
    if (!applicationId) return;
    setIsStarting(true);
    setActionError(null);
    try {
      await employeeApi.startApplicationReview(applicationId);
      await refresh();
    } catch (requestError) {
      if (requestError instanceof ApiError && (requestError.status === 401 || requestError.status === 403)) onSessionExpired();
      else setActionError(requestError instanceof ApiError ? requestError.message : "The application could not enter review.");
    } finally {
      setIsStarting(false);
    }
  }

  async function confirmDecision(): Promise<void> {
    if (!intent || !applicationId) return;
    const trimmedNote = note.trim();
    if (trimmedNote.length < 3 || trimmedNote.length > 1000) {
      setActionError("Enter an officer note between 3 and 1000 characters before recording a decision.");
      return;
    }

    setIsDeciding(true);
    setActionError(null);
    try {
      await employeeApi.decideApplication(applicationId, { status: intent, note: trimmedNote });
      setIntent(null);
      setNote("");
      await refresh();
    } catch (requestError) {
      if (requestError instanceof ApiError && (requestError.status === 401 || requestError.status === 403)) onSessionExpired();
      else setActionError(requestError instanceof ApiError ? requestError.message : "The officer decision could not be recorded.");
    } finally {
      setIsDeciding(false);
    }
  }

  async function issueGeneratedDocument(): Promise<void> {
    if (!applicationId) return;
    setIsIssuing(true);
    setIssuanceError(null);
    try {
      await employeeApi.issueGeneratedDocument(applicationId);
      await refresh();
    } catch (requestError) {
      if (requestError instanceof ApiError && (requestError.status === 401 || requestError.status === 403)) onSessionExpired();
      else setIssuanceError(requestError instanceof ApiError ? requestError.message : "The generated document could not be issued.");
    } finally {
      setIsIssuing(false);
    }
  }

  return (
    <div className="dashboard-shell">
      <EmployeeHeader activeView="applications" onNavigateDashboard={onNavigateDashboard} onNavigateApplications={onNavigateApplications} onNavigateCompleted={onNavigateCompleted} onNavigateProfile={onNavigateProfile} onReturnToLogin={onReturnToLogin} />

      <main className="review-page">
        <button className="details-back" type="button" onClick={onNavigateIdentityVerification}>Back to identity verification</button>

        <section className="review-intro" aria-labelledby="review-title">
          <div><p className="eyebrow">OFFICER REVIEW · DEMO / PROTOTYPE</p><h1 id="review-title">Application review</h1><p>{review ? `${review.applicationNumber} · ${review.service.name} · authorized officer review workspace` : "Loading authorized review data…"}</p></div>
          <span className="preview-badge">{isLoading ? "LOADING" : "OFFICER REVIEW"}</span>
        </section>

        <aside className="advisory-banner" role="note"><strong>Human review remains required.</strong><span>AI and identity sections are safe prototype inputs only. They never independently approve, request correction, or reject an application.</span></aside>
        {error ? <aside className="details-disclaimer" role="alert"><strong>Review unavailable.</strong><span>{error}</span><button className="queue-panel__link" type="button" onClick={() => void refresh()}>Retry</button></aside> : null}

        <section className="review-reference" aria-label="Application review context">
          <div><span>Application</span><strong>{review?.applicationNumber ?? "Loading"}</strong></div>
          <div><span>Service</span><strong>{review?.service.name ?? "Loading"}</strong></div>
          <div><span>Applicant</span><strong>{review?.applicant.fullName ?? "Loading"}</strong></div>
          <div><span>Current state</span><strong>{review ? `${review.status} · ${review.reviewStatus}` : "Loading"}</strong></div>
        </section>

        <div className="review-summary-grid">
          <section className="review-summary-card" aria-labelledby="documents-summary-title">
            <p className="panel-kicker">DOCUMENT REVIEW SUMMARY</p><h2 id="documents-summary-title">Authorized document metadata</h2>
            <ul><li>{review?.documents.length ?? 0} uploaded document metadata record(s)</li><li>{review?.mockIssuedDocumentAttachments.length ?? 0} read-only mock issued reference(s)</li><li>{review?.generatedDocuments.length ?? 0} generated-document state record(s)</li><li>{review?.history.length ?? 0} status-history entry(s)</li></ul>
            <p>{latestHistorySummary(review)} Uploaded documents and mock-issued references remain separate. No document file or storage data is shown.</p>
          </section>
          <section className="review-summary-card" aria-labelledby="ai-summary-title">
            <p className="panel-kicker">AI PRE-VERIFICATION SUMMARY</p><h2 id="ai-summary-title">Advisory prototype diagnostics</h2>
            <ul><li>{diagnosticCount} uploaded document(s) with advisory diagnostics</li><li>{review?.documents.filter((document) => document.diagnostics?.isReadable === false).length ?? 0} readability attention item(s)</li><li>Automated decision: not available</li></ul>
            <p>Only allowlisted diagnostics are displayed. The officer must assess the application independently.</p>
          </section>
          <section className="review-summary-card" aria-labelledby="identity-summary-title">
            <p className="panel-kicker">IDENTITY VERIFICATION SUMMARY</p><h2 id="identity-summary-title">Mock verification stages</h2>
            <ul>{review?.identityVerifications.length ? review.identityVerifications.map((verification) => <li key={verification.verificationId}>{verification.type}: {verification.status}</li>) : <li>No safe identity verification summaries provided</li>}</ul>
            <p>No biometric, identity-provider, or government data is accessed from this employee workspace.</p>
          </section>
        </div>

        {terminalDecision ? (
          <section className={`review-decision-result review-decision-result--${terminalDecision === "REJECTED" ? "rejection" : terminalDecision === "APPROVED" ? "approval" : "correction"}`} role="status">
            <div><p className="panel-kicker">BACKEND-CONFIRMED DECISION</p><h2>{decisionLabel(terminalDecision)}</h2><p>{terminalDecision === "APPROVED" ? review?.generatedDocuments.length ? "Application approved. Generated document is ready for citizen signing. The citizen must explicitly complete the mock e-sign and completion workflow." : "Application approved. Issue the server-generated demo document so the citizen can review and explicitly complete mock e-signing." : terminalDecision === "CORRECTION_REQUIRED" ? "Correction-required status is recorded. A citizen remediation/resubmission lifecycle is not implemented in this batch." : "Rejection is recorded for this prototype application."}</p>{issuanceError ? <p className="field-error" role="alert">{issuanceError}</p> : null}</div>
            <div className="review-decision-panel__actions">{terminalDecision === "APPROVED" && !review?.generatedDocuments.length ? <button className="decision-button decision-button--approve" type="button" disabled={isIssuing} onClick={() => void issueGeneratedDocument()}>{isIssuing ? "Issuing…" : "Issue generated document"}</button> : null}<button type="button" onClick={onNavigateApplicationDetails}>Return to application details</button></div>
          </section>
        ) : canStartReview ? (
          <section className="review-decision-panel" aria-labelledby="decision-title">
            <div><p className="panel-kicker">REVIEW START</p><h2 id="decision-title">Start officer review</h2><p>This assigned submitted application is eligible to enter employee review. Starting review is an explicit backend transition and does not make a final decision.</p></div>
            <div className="review-decision-panel__actions"><button className="decision-button decision-button--approve" type="button" disabled={isStarting} onClick={() => void startReview()}>{isStarting ? "Starting…" : "Start review"}</button></div>
          </section>
        ) : (
          <section className="review-decision-panel" aria-labelledby="decision-title">
            <div><p className="panel-kicker">FINAL OFFICER DECISION</p><h2 id="decision-title">Record an officer decision</h2><p>{canDecide ? "An officer note is required for every decision. The backend is authoritative and the workspace refreshes after success." : "A final decision is available only after the backend reports UNDER_REVIEW."}</p>{actionError ? <p className="field-error" role="alert">{actionError}</p> : null}</div>
            <div className="review-decision-panel__actions"><button className="decision-button decision-button--reject" type="button" disabled={!canDecide || isDeciding} onClick={() => setIntent("REJECTED")}>Reject</button><button className="decision-button decision-button--correction" type="button" disabled={!canDecide || isDeciding} onClick={() => setIntent("CORRECTION_REQUIRED")}>Request correction</button><button className="decision-button decision-button--approve" type="button" disabled={!canDecide || isDeciding} onClick={() => setIntent("APPROVED")}>Approve</button></div>
          </section>
        )}
      </main>

      {activeDecision ? <div className="decision-modal-backdrop" role="presentation"><section className="decision-modal" role="dialog" aria-modal="true" aria-labelledby="decision-modal-title" aria-describedby="decision-modal-description"><p className="panel-kicker">DEMO / PROTOTYPE DECISION</p><h2 id="decision-modal-title">{activeDecision.title}</h2><p id="decision-modal-description">{activeDecision.body}</p><label className="review-note"><span>Officer note</span><textarea value={note} maxLength={1000} onChange={(event) => { setNote(event.target.value); setActionError(null); }} placeholder="Required: 3–1000 characters" /></label>{actionError ? <p className="field-error" role="alert">{actionError}</p> : null}<div><button className="modal-cancel" type="button" disabled={isDeciding} onClick={() => setIntent(null)}>Cancel</button><button className="modal-confirm" type="button" disabled={isDeciding} onClick={() => void confirmDecision()}>{isDeciding ? "Recording…" : activeDecision.confirm}</button></div></section></div> : null}

      <footer className="dashboard-footer"><span>JANSEVA-X Employee Desk</span><span>Demo environment · Officer decision remains human-controlled</span></footer>
    </div>
  );
}
