import { useEffect, useMemo, useState } from "react";
import { EmployeeHeader } from "../components/EmployeeHeader";
import { ApiError, employeeApi, type ApplicationDetail, type QueueApplication } from "../lib/api";
import { getEmployeeSession } from "../lib/auth";

interface ApplicationDetailsPageProps {
  onNavigateApplications: () => void;
  onNavigateCompleted: () => void;
  onNavigateProfile: () => void;
  onNavigateDocumentReview: () => void;
  onNavigateDashboard: () => void;
  applicationId: string | null;
  queueApplication: QueueApplication | null;
  onSessionExpired: () => void;
  onReturnToLogin: () => void;
}

function formatDate(value: string | null): string {
  if (!value) return "Not available";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function ApplicationDetailsPage({ onNavigateApplications, onNavigateCompleted, onNavigateProfile, onNavigateDocumentReview, onNavigateDashboard, applicationId, queueApplication, onSessionExpired, onReturnToLogin }: ApplicationDetailsPageProps) {
  const [application, setApplication] = useState<ApplicationDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isClaiming, setIsClaiming] = useState(false);
  const [claimComplete, setClaimComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const employee = getEmployeeSession();
  const claimRequired = useMemo(() => Boolean(
    !claimComplete
    && queueApplication
    && employee?.role === "OFFICER"
    && employee.officer
    && queueApplication.status === "SUBMITTED"
    && queueApplication.reviewStatus === "NOT_ASSIGNED"
    && queueApplication.assignedOfficer === null,
  ), [claimComplete, employee, queueApplication]);

  async function loadApplication(): Promise<void> {
    if (!applicationId || claimRequired) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const result = await employeeApi.application(applicationId);
      setApplication(result.application);
    } catch (requestError) {
      if (requestError instanceof ApiError && (requestError.status === 401 || requestError.status === 403)) onSessionExpired();
      else setError(requestError instanceof ApiError ? requestError.message : "The application detail could not be loaded.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => { void loadApplication(); }, [applicationId, claimRequired]);

  async function claimApplication(): Promise<void> {
    if (!applicationId) return;
    setIsClaiming(true);
    setError(null);
    try {
      await employeeApi.claimApplication(applicationId);
      setClaimComplete(true);
      const result = await employeeApi.application(applicationId);
      setApplication(result.application);
    } catch (requestError) {
      if (requestError instanceof ApiError && (requestError.status === 401 || requestError.status === 403)) onSessionExpired();
      else setError(requestError instanceof ApiError ? requestError.message : "The application could not be claimed.");
    } finally {
      setIsClaiming(false);
      setIsLoading(false);
    }
  }

  if (!applicationId) {
    return (
      <div className="dashboard-shell">
        <EmployeeHeader activeView="applications" onNavigateDashboard={onNavigateDashboard} onNavigateApplications={onNavigateApplications} onNavigateCompleted={onNavigateCompleted} onNavigateProfile={onNavigateProfile} onReturnToLogin={onReturnToLogin} />
        <main className="details-page">
          <button className="details-back" type="button" onClick={onNavigateApplications}>Back to applications</button>
          <section className="details-intro"><div><p className="eyebrow">APPLICATION DOSSIER</p><h1>Application not selected</h1><p>Select an authorized application from the work queue to view its safe employee detail.</p></div></section>
        </main>
        <footer className="dashboard-footer"><span>JANSEVA-X Employee Desk</span><span>Demo environment · Authorized prototype records only</span></footer>
      </div>
    );
  }

  const displayed = application ?? queueApplication;
  const generatedSummary = application?.generatedDocuments.length
    ? application.generatedDocuments.map((document) => document.signatureStatus).join(", ")
    : "No generated document record";

  return (
    <div className="dashboard-shell">
      <EmployeeHeader activeView="applications" onNavigateDashboard={onNavigateDashboard} onNavigateApplications={onNavigateApplications} onNavigateCompleted={onNavigateCompleted} onNavigateProfile={onNavigateProfile} onReturnToLogin={onReturnToLogin} />

      <main className="details-page">
        <button className="details-back" type="button" onClick={onNavigateApplications}>Back to applications</button>

        <section className="details-intro" aria-labelledby="details-title">
          <div>
            <p className="eyebrow">APPLICATION DOSSIER · DEMO / PROTOTYPE</p>
            <h1 id="details-title">Application details</h1>
            <p>Safe authorized employee metadata for a JANSEVA-X prototype application. No government registry lookup or document-file preview is available.</p>
          </div>
          <span className="preview-badge">DEMO / PROTOTYPE</span>
        </section>

        <section className="details-reference" aria-label="Application reference">
          <div><p>Application reference</p><strong>{displayed?.applicationNumber ?? "Loading…"}</strong></div>
          <div><p>Service</p><strong>{displayed?.service.name ?? "Loading…"}</strong></div>
          <div><p>Application status</p><span className="detail-status">{displayed?.status ?? "LOADING"}</span></div>
          <div><p>Review state</p><strong>{displayed?.reviewStatus ?? "Loading"}</strong></div>
        </section>

        <aside className="details-disclaimer" role="note">
          <strong>Safe metadata only.</strong>
          <span>Uploaded-document metadata remains separate from read-only mock issued-document references. This employee API does not expose files, raw identity data, biometric data, or provider payloads.</span>
        </aside>

        <div className="details-grid">
          <section className="details-panel" aria-labelledby="application-overview-title">
            <header><p className="panel-kicker">APPLICATION OVERVIEW</p><h2 id="application-overview-title">Applicant and submission</h2></header>
            <dl className="details-list">
              <div><dt>Applicant</dt><dd>{application?.citizen.fullName ?? queueApplication?.citizen.fullName ?? "Loading…"}</dd></div>
              <div><dt>Citizen reference</dt><dd>{application?.citizen.citizenId ?? queueApplication?.citizen.citizenId ?? "Loading…"}</dd></div>
              <div><dt>Submission time</dt><dd>{formatDate(application?.submittedAt ?? queueApplication?.submittedAt ?? null)}</dd></div>
              <div><dt>Assigned officer</dt><dd>{application?.assignedOfficer?.displayName ?? queueApplication?.assignedOfficer?.displayName ?? "Unassigned"}</dd></div>
              <div><dt>Application documents</dt><dd>{application ? `${application.documents.length} uploaded metadata record(s)` : "Available after authorized detail load"}</dd></div>
              <div><dt>Review timeline</dt><dd>{application ? `${application.history.length} status-history entry(s), updated ${formatDate(application.updatedAt)}` : "Available after authorized detail load"}</dd></div>
            </dl>
          </section>

          <section className="details-panel" aria-labelledby="document-summary-title">
            <header><p className="panel-kicker">DOCUMENT STATUS</p><h2 id="document-summary-title">Document summary</h2></header>
            <div className="document-summary-list">
              <div><span>Uploaded supporting documents</span><strong>{application ? `${application.documents.length} metadata record(s)` : "Loading"}</strong></div>
              <div><span>Mock issued-document references</span><strong>{application ? `${application.mockIssuedDocumentAttachments.length} read-only reference(s)` : "Loading"}</strong></div>
              <div><span>Generated-document state</span><strong>{application ? generatedSummary : "Loading"}</strong></div>
            </div>
            <p className="details-panel__note">Document metadata is displayed separately from issued demo references. No document file, document bytes, or raw verification payload is available from this endpoint.</p>
          </section>
        </div>

        <section className="next-step-panel" aria-labelledby="next-step-title">
          <div>
            <p className="panel-kicker">NEXT WORKFLOW STEP</p>
            <h2 id="next-step-title">{claimRequired ? "Claim application" : "Document review"}</h2>
            <p>{claimRequired ? "This unassigned submitted application must be claimed before its authorized detail and review workspace can be opened." : "After authorized application data is loaded, the officer can proceed to the local document-review prototype screen."}</p>
          </div>
          {claimRequired ? <button type="button" disabled={isClaiming} onClick={() => void claimApplication()}>{isClaiming ? "Claiming…" : "Claim application"}</button> : <button type="button" disabled={isLoading || Boolean(error) || !application} onClick={onNavigateDocumentReview}>Open document review</button>}
        </section>
        {error ? <aside className="details-disclaimer" role="alert"><strong>Application unavailable.</strong><span>{error}</span>{!claimRequired ? <button className="queue-panel__link" type="button" onClick={() => void loadApplication()}>Retry</button> : null}</aside> : null}
      </main>

      <footer className="dashboard-footer"><span>JANSEVA-X Employee Desk</span><span>Demo environment · Authorized prototype metadata only</span></footer>
    </div>
  );
}
