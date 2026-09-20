import { useEffect, useState } from "react";
import { EmployeeHeader } from "../components/EmployeeHeader";
import { StatusCard } from "../components/StatusCard";
import { ApiError, employeeApi, type DashboardData, type QueueApplication } from "../lib/api";

interface DashboardPageProps {
  onNavigateApplications: () => void;
  onNavigateCompleted: () => void;
  onNavigateProfile: () => void;
  onOpenApplication: (application: QueueApplication) => void;
  onSessionExpired: () => void;
  onReturnToLogin: () => void;
}

function formatDate(value: string | null): string {
  if (!value) return "Not submitted";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function DashboardPage({ onNavigateApplications, onNavigateCompleted, onNavigateProfile, onOpenApplication, onSessionExpired, onReturnToLogin }: DashboardPageProps) {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadDashboard(): Promise<void> {
    setIsLoading(true);
    setError(null);
    try {
      setDashboard(await employeeApi.dashboard());
    } catch (requestError) {
      if (requestError instanceof ApiError && (requestError.status === 401 || requestError.status === 403)) onSessionExpired();
      else setError(requestError instanceof ApiError ? requestError.message : "The dashboard could not be loaded.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => { void loadDashboard(); }, []);

  const statusCards = dashboard ? [
    { label: "Total queue", value: dashboard.counts.total, description: `${dashboard.counts.claimable} available to claim`, tone: "blue" as const },
    { label: "Under review", value: dashboard.counts.byApplicationStatus.UNDER_REVIEW, description: "Active employee review cases", tone: "blue" as const },
    { label: "Correction pending", value: dashboard.counts.byApplicationStatus.CORRECTION_REQUIRED, description: "Awaiting future citizen correction flow", tone: "amber" as const },
    { label: "Approved", value: dashboard.counts.byApplicationStatus.APPROVED, description: "Awaiting mock certificate issuance", tone: "green" as const },
    { label: "Completed", value: dashboard.counts.byApplicationStatus.COMPLETED, description: "Citizen-owned mock completion recorded", tone: "slate" as const },
  ] : [];

  return (
    <div className="dashboard-shell">
      <EmployeeHeader activeView="dashboard" onNavigateDashboard={() => undefined} onNavigateApplications={onNavigateApplications} onNavigateCompleted={onNavigateCompleted} onNavigateProfile={onNavigateProfile} onReturnToLogin={onReturnToLogin} />

      <main className="dashboard-page">
        <section className="dashboard-intro" aria-labelledby="dashboard-title">
          <div>
            <p className="eyebrow">EMPLOYEE WORKSPACE · DEMO / PROTOTYPE</p>
            <h1 id="dashboard-title">Dashboard</h1>
            <p>Review queue visibility and case management for authorized JANSEVA-X prototype applications.</p>
          </div>
          <div className="dashboard-mode" role="status">
            <span className="dashboard-mode__dot" aria-hidden="true" />
            {isLoading ? "Loading workspace" : "Authorized employee workspace"}
          </div>
        </section>

        <section className="status-card-grid" aria-label="Application queue summary">
          {isLoading ? <StatusCard label="Loading queue" value="…" description="Retrieving authorized application counts" tone="blue" /> : null}
          {!isLoading && error ? <StatusCard label="Queue unavailable" value="—" description="Retry below to load the work queue" tone="amber" /> : null}
          {!isLoading && !error ? statusCards.map((card) => <StatusCard key={card.label} {...card} />) : null}
        </section>

        <section className="queue-panel" aria-labelledby="queue-title">
          <header className="queue-panel__header">
            <div>
              <p className="panel-kicker">APPLICATION REGISTRY</p>
              <h2 id="queue-title">Application work queue</h2>
            </div>
            <div className="queue-panel__actions">
              <span className="queue-panel__state">{isLoading ? "Loading" : error ? "Unavailable" : "Authorized queue"}</span>
              <button className="queue-panel__link" type="button" onClick={onNavigateApplications}>View applications</button>
            </div>
          </header>

          <div className="queue-table-wrap">
            <table className="queue-table">
              <thead>
                <tr>
                  <th scope="col">Application</th>
                  <th scope="col">Citizen</th>
                  <th scope="col">Service</th>
                  <th scope="col">Status</th>
                  <th scope="col">Submitted</th>
                  <th scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? <tr><td colSpan={6} className="queue-table__empty">Loading authorized application records…</td></tr> : null}
                {error ? <tr><td colSpan={6} className="queue-table__empty"><p>{error}</p><button className="preview-entry" type="button" onClick={() => void loadDashboard()}>Retry dashboard</button></td></tr> : null}
                {!isLoading && !error && dashboard?.recentApplications.length === 0 ? <tr><td colSpan={6} className="queue-table__empty">No authorized applications are currently visible in the work queue.</td></tr> : null}
                {!isLoading && !error ? dashboard?.recentApplications.map((application) => (
                  <tr key={application.applicationId}>
                    <td><strong>{application.applicationNumber}</strong></td>
                    <td>{application.citizen.fullName}</td>
                    <td>{application.service.name}</td>
                    <td><span className="detail-status">{application.status}</span></td>
                    <td>{formatDate(application.submittedAt)}</td>
                    <td><button className="queue-panel__link" type="button" onClick={() => onOpenApplication(application)}>Open</button></td>
                  </tr>
                )) : null}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      <footer className="dashboard-footer">
        <span>JANSEVA-X Employee Desk</span>
        <span>Demo environment · Authorized prototype records only</span>
      </footer>
    </div>
  );
}
