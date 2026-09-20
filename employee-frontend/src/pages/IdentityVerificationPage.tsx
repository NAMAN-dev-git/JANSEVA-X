import { useMemo, useState } from "react";
import { EmployeeHeader } from "../components/EmployeeHeader";
import { ApiError, employeeApi, type IdentityReviewAction } from "../lib/api";
import { useApplicationReview } from "../hooks/useApplicationReview";

interface IdentityVerificationPageProps {
  applicationId: string | null;
  onNavigateAiPreVerification: () => void;
  onNavigateApplications: () => void;
  onNavigateCompleted: () => void;
  onNavigateProfile: () => void;
  onNavigateReview: () => void;
  onNavigateDashboard: () => void;
  onSessionExpired: () => void;
  onReturnToLogin: () => void;
}

const verificationMethods = [
  { type: "AADHAAR", name: "Mock Aadhaar reference", detail: "Safe prototype verification summary only. No Aadhaar lookup is made." },
  { type: "PAN", name: "Mock PAN reference", detail: "Safe prototype verification summary only. No PAN lookup is made." },
  { type: "FACE", name: "Face verification simulation", detail: "Safe mock status only. No camera, photo, face-recognition API, or biometric provider is accessed." },
  { type: "FINGERPRINT", name: "Fingerprint simulation", detail: "Safe mock status only. No scanner, fingerprint device, template, or biometric service is accessed." },
  { type: "E_KYC", name: "e-KYC indicator", detail: "Safe mock status only. No e-KYC credential or government registry interaction is performed." },
] as const;

function toneForStatus(status: string): "blue" | "amber" | "slate" {
  if (status === "VERIFIED") return "blue";
  if (status === "FAILED" || status === "MANUAL_REVIEW") return "amber";
  return "slate";
}

export function IdentityVerificationPage({ applicationId, onNavigateAiPreVerification, onNavigateApplications, onNavigateCompleted, onNavigateProfile, onNavigateReview, onNavigateDashboard, onSessionExpired, onReturnToLogin }: IdentityVerificationPageProps) {
  const { review, isLoading, error, refresh } = useApplicationReview(applicationId, onSessionExpired);
  const [note, setNote] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ verificationId: string; action: IdentityReviewAction } | null>(null);
  const verificationByType = useMemo(() => new Map(review?.identityVerifications.map((verification) => [verification.type, verification])), [review]);

  async function reviewIdentity(verificationId: string, action: IdentityReviewAction): Promise<void> {
    if (!applicationId) return;
    const trimmedNote = note.trim();
    if (trimmedNote.length < 3 || trimmedNote.length > 1000) {
      setActionError("Enter an officer note between 3 and 1000 characters before recording an identity review action.");
      return;
    }

    setPending({ verificationId, action });
    setActionError(null);
    try {
      await employeeApi.reviewIdentityVerification(applicationId, verificationId, { action, note: trimmedNote });
      setNote("");
      await refresh();
    } catch (requestError) {
      if (requestError instanceof ApiError && (requestError.status === 401 || requestError.status === 403)) onSessionExpired();
      else setActionError(requestError instanceof ApiError ? requestError.message : "The identity review action could not be recorded.");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="dashboard-shell">
      <EmployeeHeader activeView="applications" onNavigateDashboard={onNavigateDashboard} onNavigateApplications={onNavigateApplications} onNavigateCompleted={onNavigateCompleted} onNavigateProfile={onNavigateProfile} onReturnToLogin={onReturnToLogin} />

      <main className="identity-page">
        <button className="details-back" type="button" onClick={onNavigateAiPreVerification}>Back to AI pre-verification</button>

        <section className="identity-intro" aria-labelledby="identity-title">
          <div><p className="eyebrow">IDENTITY VERIFICATION · DEMO / PROTOTYPE</p><h1 id="identity-title">Identity verification</h1><p>{review ? `${review.applicationNumber} · ${review.applicant.fullName} · safe mock verification summaries only` : "Loading authorized identity verification summaries…"}</p></div>
          <span className="preview-badge">NO LIVE IDENTITY CHECKS</span>
        </section>

        <aside className="advisory-banner" role="note"><strong>Mock workflow only.</strong><span>No real Aadhaar, PAN, face, fingerprint, biometric device, e-KYC service, or government registry is accessed from this screen.</span></aside>
        {error ? <aside className="details-disclaimer" role="alert"><strong>Identity data unavailable.</strong><span>{error}</span><button className="queue-panel__link" type="button" onClick={() => void refresh()}>Retry</button></aside> : null}

        <section className="identity-context" aria-label="Identity verification context">
          <div><span>Application</span><strong>{review?.applicationNumber ?? "Loading"}</strong></div>
          <div><span>Applicant</span><strong>{review?.applicant.fullName ?? "Loading"}</strong></div>
          <div><span>Verification state</span><strong>{review?.identityVerifications.length ? `${review.identityVerifications.length} safe summary record(s)` : "Not provided"}</strong></div>
        </section>

        <section className="identity-methods-panel" aria-labelledby="verification-methods-title">
          <header><p className="panel-kicker">MOCK VERIFICATION METHODS</p><h2 id="verification-methods-title">Identity verification stages</h2></header>
          <div className="identity-method-grid">
            {verificationMethods.map((method) => {
              const verification = verificationByType.get(method.type);
              const isPending = pending?.verificationId === verification?.verificationId;
              return (
                <article className="identity-method-card" key={method.type}>
                  <span className={`identity-method-card__status identity-method-card__status--${toneForStatus(verification?.status ?? "NOT_PROVIDED")}`}>{verification?.status ?? "NOT PROVIDED"}</span>
                  <h3>{method.name}</h3>
                  <p>{verification?.failureReason ?? method.detail}</p>
                  {verification ? <div className="identity-method-card__actions">
                    <button type="button" disabled={pending !== null} onClick={() => void reviewIdentity(verification.verificationId, "VERIFY")}>{isPending && pending?.action === "VERIFY" ? "Recording…" : "Verify"}</button>
                    <button type="button" disabled={pending !== null} onClick={() => void reviewIdentity(verification.verificationId, "REQUEST_MANUAL_REVIEW")}>Manual review</button>
                    <button type="button" disabled={pending !== null} onClick={() => void reviewIdentity(verification.verificationId, "REJECT")}>Reject</button>
                  </div> : null}
                  <small>DEMO / PROTOTYPE</small>
                </article>
              );
            })}
          </div>
        </section>

        <section className="identity-decision-panel" aria-labelledby="identity-decision-title">
          <div>
            <p className="panel-kicker">OFFICER REVIEW HANDOFF</p>
            <h2 id="identity-decision-title">Record a safe identity-review action</h2>
            <p>Use the method controls above only for verification summaries returned by the backend. Every action requires an officer note and does not trigger a live identity check.</p>
            <label className="review-note"><span>Officer note</span><textarea value={note} maxLength={1000} onChange={(event) => { setNote(event.target.value); setActionError(null); }} placeholder="Required: 3–1000 characters" /></label>
            {actionError ? <p className="field-error" role="alert">{actionError}</p> : null}
          </div>
          <button className="identity-decision-panel__next" type="button" disabled={!review || isLoading} onClick={onNavigateReview}>Open review</button>
        </section>
      </main>

      <footer className="dashboard-footer"><span>JANSEVA-X Employee Desk</span><span>Demo environment · Mock identity workflow only</span></footer>
    </div>
  );
}
