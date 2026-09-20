import { EmployeeHeader } from "../components/EmployeeHeader";
import type { CompletedApplication } from "../lib/api";

interface CompletedPageProps {
  application: CompletedApplication | null;
  onNavigateApplications: () => void;
  onNavigateCompletedApplications: () => void;
  onNavigateProfile: () => void;
  onNavigateDashboard: () => void;
  onReturnToLogin: () => void;
}

function formatDate(value: string | null): string {
  if (!value) return "Not available";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function CompletedPage({ application, onNavigateApplications, onNavigateCompletedApplications, onNavigateProfile, onNavigateDashboard, onReturnToLogin }: CompletedPageProps) {
  const generatedDocument = application?.generatedDocuments[0] ?? null;

  return (
    <div className="dashboard-shell">
      <EmployeeHeader activeView="completed" onNavigateDashboard={onNavigateDashboard} onNavigateApplications={onNavigateApplications} onNavigateCompleted={onNavigateCompletedApplications} onNavigateProfile={onNavigateProfile} onReturnToLogin={onReturnToLogin} />

      <main className="completed-page">
        <button className="details-back" type="button" onClick={onNavigateCompletedApplications}>Back to completed applications</button>

        {!application ? <section className="completed-hero" aria-labelledby="completed-title"><p className="eyebrow">COMPLETED APPLICATION - DEMO / PROTOTYPE</p><h1 id="completed-title">Completed application not selected</h1><p>Select an authorized completed record from the completed applications registry.</p></section> : <>
          <section className="completed-hero" aria-labelledby="completed-title">
            <p className="eyebrow">COMPLETED APPLICATION - DEMO / PROTOTYPE</p>
            <h1 id="completed-title">Citizen-owned completion recorded</h1>
            <p>{application.applicationNumber} - {application.service.name} - completion is recorded only for this JANSEVA-X prototype workflow.</p>
            <span className="completed-status">{application.status} - DEMO</span>
          </section>

          <aside className="completed-disclaimer" role="note">
            <strong>Not government-issued.</strong>
            <span>The citizen explicitly completed a mock e-sign and completion workflow. No official approval, certificate, registry operation, or legal signature is represented.</span>
          </aside>

          <section className="completed-summary-grid" aria-label="Completed application summary">
            <div><span>Application reference</span><strong>{application.applicationNumber}</strong></div>
            <div><span>Service</span><strong>{application.service.name}</strong></div>
            <div><span>Applicant</span><strong>{application.citizen.fullName}</strong></div>
            <div><span>Completion timestamp</span><strong>{formatDate(application.completedAt)}</strong></div>
          </section>

          <section className="completed-document-panel" aria-labelledby="completion-document-title">
            <div>
              <p className="panel-kicker">DOCUMENT AND SIGNATURE SUMMARY</p>
              <h2 id="completion-document-title">Generated demo document state</h2>
              <p>{generatedDocument ? `${generatedDocument.documentName} · ${generatedDocument.signatureStatus}${generatedDocument.signedAt ? ` · signed ${formatDate(generatedDocument.signedAt)}` : ""}` : "No generated-document metadata was returned for this completed record."}</p>
            </div>
            <span>DEMO / MOCK ONLY</span>
          </section>
        </>}

        <div className="completed-actions">
          <button type="button" onClick={onNavigateCompletedApplications}>View completed applications</button>
          <button className="completed-actions__secondary" type="button" onClick={onNavigateApplications}>Return to applications</button>
        </div>
      </main>

      <footer className="dashboard-footer">
        <span>JANSEVA-X Employee Desk</span>
        <span>Demo environment - Citizen-owned mock completion only</span>
      </footer>
    </div>
  );
}
