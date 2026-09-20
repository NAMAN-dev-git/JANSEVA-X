import { useEffect, useState } from "react";
import { EmployeeHeader } from "../components/EmployeeHeader";
import { ApiError, employeeApi, type CompletedApplication, type Pagination } from "../lib/api";

interface CompletedApplicationsPageProps {
  onOpenCompletedApplication: (application: CompletedApplication) => void;
  onNavigateApplications: () => void;
  onNavigateProfile: () => void;
  onNavigateDashboard: () => void;
  onSessionExpired: () => void;
  onReturnToLogin: () => void;
}

function formatDate(value: string | null): string {
  if (!value) return "Not available";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function CompletedApplicationsPage({ onOpenCompletedApplication, onNavigateApplications, onNavigateProfile, onNavigateDashboard, onSessionExpired, onReturnToLogin }: CompletedApplicationsPageProps) {
  const [applications, setApplications] = useState<CompletedApplication[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadCompleted(): Promise<void> {
    setIsLoading(true);
    setError(null);
    try {
      const result = await employeeApi.completedApplications({ page: 1, limit: 10, sortBy: "updatedAt", sortOrder: "desc" });
      setApplications(result.applications);
      setPagination(result.pagination);
    } catch (requestError) {
      if (requestError instanceof ApiError && (requestError.status === 401 || requestError.status === 403)) onSessionExpired();
      else setError(requestError instanceof ApiError ? requestError.message : "Completed applications could not be loaded.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => { void loadCompleted(); }, []);

  return (
    <div className="dashboard-shell">
      <EmployeeHeader activeView="completed" onNavigateDashboard={onNavigateDashboard} onNavigateApplications={onNavigateApplications} onNavigateCompleted={() => void loadCompleted()} onNavigateProfile={onNavigateProfile} onReturnToLogin={onReturnToLogin} />

      <main className="completed-registry-page">
        <section className="completed-registry-intro" aria-labelledby="completed-registry-title">
          <div>
            <p className="eyebrow">COMPLETED APPLICATIONS - DEMO / PROTOTYPE</p>
            <h1 id="completed-registry-title">Completed applications</h1>
            <p>Authorized backend records completed through the citizen-owned mock signing workflow.</p>
          </div>
          <span className="preview-badge">{isLoading ? "LOADING" : `${pagination?.total ?? 0} RECORD${pagination?.total === 1 ? "" : "S"}`}</span>
        </section>

        {error ? <aside className="details-disclaimer" role="alert"><strong>Completed registry unavailable.</strong><span>{error}</span><button className="queue-panel__link" type="button" onClick={() => void loadCompleted()}>Retry</button></aside> : null}

        <section className="completed-registry-panel" aria-labelledby="completed-registry-table-title">
          <header>
            <div>
              <p className="panel-kicker">COMPLETED REGISTRY</p>
              <h2 id="completed-registry-table-title">Authorized completed records</h2>
            </div>
            <p>Safe completion and generated-document metadata only.</p>
          </header>
          <div className="queue-table-wrap">
            <table className="queue-table completed-registry-table">
              <thead>
                <tr>
                  <th scope="col">Application</th>
                  <th scope="col">Applicant</th>
                  <th scope="col">Service</th>
                  <th scope="col">Completion</th>
                  <th scope="col">Status</th>
                  <th scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? <tr><td colSpan={6}>Loading authorized completed records…</td></tr> : null}
                {!isLoading && !error && applications.length === 0 ? <tr><td colSpan={6}>No completed prototype applications are available for this employee.</td></tr> : null}
                {!isLoading && applications.map((application) => <tr key={application.applicationId}>
                  <td><strong>{application.applicationNumber}</strong><small>DEMO / PROTOTYPE</small></td>
                  <td>{application.citizen.fullName}<small>{application.citizen.city ?? application.citizen.state ?? "Location not provided"}</small></td>
                  <td>{application.service.name}</td>
                  <td>{formatDate(application.completedAt)}</td>
                  <td><span className="completed-table-status">{application.status}</span></td>
                  <td><button className="completed-view-button" type="button" onClick={() => onOpenCompletedApplication(application)}>View</button></td>
                </tr>)}
              </tbody>
            </table>
          </div>
          <footer>
            <span>{pagination ? `Showing ${applications.length} of ${pagination.total} authorized completed record(s)` : "Loading completed records"}</span>
            <span>Citizen-owned mock consent and completion are required before records appear here.</span>
          </footer>
        </section>
      </main>

      <footer className="dashboard-footer">
        <span>JANSEVA-X Employee Desk</span>
        <span>Demo environment - Safe completion metadata only</span>
      </footer>
    </div>
  );
}
