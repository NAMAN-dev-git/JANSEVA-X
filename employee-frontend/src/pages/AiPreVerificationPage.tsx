import { useMemo } from "react";
import { EmployeeHeader } from "../components/EmployeeHeader";
import { type ApplicationReview } from "../lib/api";
import { useApplicationReview } from "../hooks/useApplicationReview";

interface AiPreVerificationPageProps {
  applicationId: string | null;
  onNavigateDocumentReview: () => void;
  onNavigateIdentityVerification: () => void;
  onNavigateApplications: () => void;
  onNavigateCompleted: () => void;
  onNavigateProfile: () => void;
  onNavigateDashboard: () => void;
  onSessionExpired: () => void;
  onReturnToLogin: () => void;
}

type AdvisoryCheck = { category: string; source: string; state: string; detail: string };

function buildChecks(review: ApplicationReview | null): AdvisoryCheck[] {
  if (!review) return [];
  const diagnostics = review.documents.filter((document) => document.diagnostics);
  if (!diagnostics.length) {
    return [{ category: "Advisory diagnostics", source: `${review.documents.length} uploaded document metadata record(s)`, state: "Not provided", detail: "The authorized review response contains no allowlisted advisory diagnostics for this application." }];
  }

  return diagnostics.map((document) => {
    const diagnostic = document.diagnostics!;
    const details = [
      diagnostic.isReadable === null ? "Readability not provided" : diagnostic.isReadable ? "Marked readable" : "Readability requires attention",
      diagnostic.missingFields.length ? `Missing fields: ${diagnostic.missingFields.join(", ")}` : "No missing fields reported",
      diagnostic.detectedIssues.length ? `Reported issues: ${diagnostic.detectedIssues.join(", ")}` : "No issues reported",
      diagnostic.signatureDetected ? `Signature: ${diagnostic.signatureDetected}` : null,
      diagnostic.sealDetected ? `Seal: ${diagnostic.sealDetected}` : null,
    ].filter(Boolean).join(" · ");
    return {
      category: document.originalFilename,
      source: diagnostic.confidence === null ? "Confidence not provided" : `Advisory confidence: ${Math.round(diagnostic.confidence * 100)}%`,
      state: diagnostic.documentType ?? "Detected type not provided",
      detail: diagnostic.recommendation ? `${details} · ${diagnostic.recommendation}` : details,
    };
  });
}

export function AiPreVerificationPage({ applicationId, onNavigateDocumentReview, onNavigateIdentityVerification, onNavigateApplications, onNavigateCompleted, onNavigateProfile, onNavigateDashboard, onSessionExpired, onReturnToLogin }: AiPreVerificationPageProps) {
  const { review, isLoading, error, refresh } = useApplicationReview(applicationId, onSessionExpired);
  const checks = useMemo(() => buildChecks(review), [review]);

  return (
    <div className="dashboard-shell">
      <EmployeeHeader activeView="applications" onNavigateDashboard={onNavigateDashboard} onNavigateApplications={onNavigateApplications} onNavigateCompleted={onNavigateCompleted} onNavigateProfile={onNavigateProfile} onReturnToLogin={onReturnToLogin} />

      <main className="preverification-page">
        <button className="details-back" type="button" onClick={onNavigateDocumentReview}>Back to document review</button>

        <section className="preverification-intro" aria-labelledby="preverification-title">
          <div>
            <p className="eyebrow">AI PRE-VERIFICATION · DEMO / PROTOTYPE</p>
            <h1 id="preverification-title">Pre-verification workspace</h1>
            <p>{review ? `${review.applicationNumber} · ${review.service.name} · safe advisory diagnostic data only` : "Loading authorized advisory review metadata…"}</p>
          </div>
          <span className="preview-badge">ADVISORY DATA ONLY</span>
        </section>

        <aside className="advisory-banner" role="note"><strong>Officer decision required.</strong><span>Diagnostics are allowlisted prototype advisory data from the existing review response. They do not verify authenticity, approve an application, or replace human review.</span></aside>
        {error ? <aside className="details-disclaimer" role="alert"><strong>Advisory data unavailable.</strong><span>{error}</span><button className="queue-panel__link" type="button" onClick={() => void refresh()}>Retry</button></aside> : null}

        <section className="preverification-context" aria-label="Pre-verification application context">
          <div><span>Application</span><strong>{review?.applicationNumber ?? "Loading"}</strong></div>
          <div><span>Applicant context</span><strong>{review?.applicant.fullName ?? "Loading"}</strong></div>
          <div><span>Documents in review</span><strong>{review ? `${review.documents.length} uploaded · ${review.mockIssuedDocumentAttachments.length} mock reference(s)` : "Loading"}</strong></div>
          <div><span>Final decision</span><strong>Officer-owned</strong></div>
        </section>

        <section className="preverification-panel" aria-labelledby="demo-checks-title">
          <header className="preverification-panel__header"><div><p className="panel-kicker">ADVISORY CHECK REGISTER</p><h2 id="demo-checks-title">Prototype pre-verification checks</h2></div><span className="queue-panel__state">{isLoading ? "Loading" : checks.length ? "Data available" : "Unavailable"}</span></header>
          <div className="demo-check-grid">
            {isLoading ? <article className="demo-check-card"><span className="demo-check-card__state">LOADING</span><h3>Review diagnostics</h3><p>Loading allowlisted advisory diagnostic fields.</p></article> : null}
            {!isLoading ? checks.map((check) => <article className="demo-check-card" key={check.category}><span className="demo-check-card__state">{check.state}</span><h3>{check.category}</h3><p className="demo-check-card__source">{check.source}</p><p>{check.detail}</p></article>) : null}
          </div>
        </section>

        <section className="preverification-result" aria-labelledby="preverification-result-title">
          <div><p className="panel-kicker">ADVISORY RESULT AREA</p><h2 id="preverification-result-title">No automated decision</h2><p>The employee backend exposes only safe advisory fields. No live AI model, registry lookup, pass/fail score, or final verification outcome is created here.</p></div>
          <button type="button" disabled={!review || isLoading} onClick={onNavigateIdentityVerification}>Continue to identity verification</button>
        </section>
      </main>

      <footer className="dashboard-footer"><span>JANSEVA-X Employee Desk</span><span>Demo environment · Advisory prototype data only</span></footer>
    </div>
  );
}
