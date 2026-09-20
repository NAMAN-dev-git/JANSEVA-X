import { useEffect, useState } from "react";
import { EmployeeHeader } from "../components/EmployeeHeader";
import { ApiError, employeeApi, type ApplicationStatus, type OfficerReviewStatus, type Pagination, type QueueApplication } from "../lib/api";

interface ApplicationsPageProps {
  onNavigateDashboard: () => void;
  onNavigateCompleted: () => void;
  onNavigateProfile: () => void;
  onOpenApplication: (application: QueueApplication) => void;
  onSessionExpired: () => void;
  onReturnToLogin: () => void;
}

const applicationStatuses: ApplicationStatus[] = ["DRAFT", "SUBMITTED", "IDENTITY_VERIFIED", "DOCUMENTS_VERIFIED", "UNDER_REVIEW", "CORRECTION_REQUIRED", "APPROVED", "REJECTED", "SIGNED", "COMPLETED"];
const reviewStatuses: OfficerReviewStatus[] = ["NOT_ASSIGNED", "ASSIGNED", "IN_REVIEW", "REVIEWED"];

function formatDate(value: string | null): string {
  if (!value) return "Not submitted";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function ApplicationsPage({ onNavigateDashboard, onNavigateCompleted, onNavigateProfile, onOpenApplication, onSessionExpired, onReturnToLogin }: ApplicationsPageProps) {
  const [applications, setApplications] = useState<QueueApplication[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ApplicationStatus | "all">("all");
  const [reviewStatus, setReviewStatus] = useState<OfficerReviewStatus | "all">("all");
  const [sortBy, setSortBy] = useState<"submittedAt" | "updatedAt">("submittedAt");
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadApplications(): Promise<void> {
    setIsLoading(true);
    setError(null);
    try {
      const result = await employeeApi.applications({
        page,
        limit: 10,
        search: search.trim() || undefined,
        status: status === "all" ? undefined : status,
        reviewStatus: reviewStatus === "all" ? undefined : reviewStatus,
        sortBy,
        sortOrder: "desc",
      });
      setApplications(result.applications);
      setPagination(result.pagination);
    } catch (requestError) {
      if (requestError instanceof ApiError && (requestError.status === 401 || requestError.status === 403)) onSessionExpired();
      else setError(requestError instanceof ApiError ? requestError.message : "The application registry could not be loaded.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => { void loadApplications(); }, [page, search, status, reviewStatus, sortBy]);

  function updateSearch(value: string): void { setPage(1); setSearch(value); }
  function updateStatus(value: ApplicationStatus | "all"): void { setPage(1); setStatus(value); }
  function updateReviewStatus(value: OfficerReviewStatus | "all"): void { setPage(1); setReviewStatus(value); }
  function updateSortBy(value: "submittedAt" | "updatedAt"): void { setPage(1); setSortBy(value); }

  return (
    <div className="dashboard-shell">
      <EmployeeHeader activeView="applications" onNavigateDashboard={onNavigateDashboard} onNavigateApplications={() => undefined} onNavigateCompleted={onNavigateCompleted} onNavigateProfile={onNavigateProfile} onReturnToLogin={onReturnToLogin} />

      <main className="applications-page">
        <section className="applications-intro" aria-labelledby="applications-title">
          <div>
            <p className="eyebrow">APPLICATION REGISTRY · DEMO / PROTOTYPE</p>
            <h1 id="applications-title">Applications</h1>
            <p>View submitted applications, assignment status, and review progress from the employee work queue.</p>
          </div>
          <span className="queue-panel__state">{isLoading ? "Loading" : error ? "Unavailable" : "Authorized queue"}</span>
        </section>

        <section className="applications-panel" aria-labelledby="applications-queue-title">
          <header className="applications-panel__header">
            <div>
              <p className="panel-kicker">WORK QUEUE</p>
              <h2 id="applications-queue-title">Application registry</h2>
            </div>
            <p>Search, status, review state, and ordering apply only to applications authorized for this employee session.</p>
          </header>

          <form className="queue-filters" aria-label="Application queue filters" onSubmit={(event) => event.preventDefault()}>
            <fieldset disabled={isLoading}>
              <div className="queue-filter-search">
                <label htmlFor="application-search">Search applications</label>
                <input id="application-search" type="search" placeholder="Search by application ID or citizen" value={search} onChange={(event) => updateSearch(event.target.value)} />
              </div>
              <div>
                <label htmlFor="application-status">Application status</label>
                <select id="application-status" value={status} onChange={(event) => updateStatus(event.target.value as ApplicationStatus | "all")}>
                  <option value="all">All statuses</option>
                  {applicationStatuses.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="review-status">Review status</label>
                <select id="review-status" value={reviewStatus} onChange={(event) => updateReviewStatus(event.target.value as OfficerReviewStatus | "all")}>
                  <option value="all">All review statuses</option>
                  {reviewStatuses.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="queue-sort">Sort by</label>
                <select id="queue-sort" value={sortBy} onChange={(event) => updateSortBy(event.target.value as "submittedAt" | "updatedAt")}>
                  <option value="submittedAt">Submitted date</option>
                  <option value="updatedAt">Last updated</option>
                </select>
              </div>
            </fieldset>
          </form>

          <div className="queue-table-wrap">
            <table className="queue-table">
              <thead>
                <tr>
                  <th scope="col">Application</th>
                  <th scope="col">Citizen</th>
                  <th scope="col">Service</th>
                  <th scope="col">Status</th>
                  <th scope="col">Review status</th>
                  <th scope="col">Submitted</th>
                  <th scope="col">Assignment</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? <tr><td colSpan={7} className="queue-table__empty">Loading authorized application records…</td></tr> : null}
                {error ? <tr><td colSpan={7} className="queue-table__empty"><p>{error}</p><button className="preview-entry" type="button" onClick={() => void loadApplications()}>Retry registry</button></td></tr> : null}
                {!isLoading && !error && applications.length === 0 ? <tr><td colSpan={7} className="queue-table__empty">No applications match the current authorized queue filters.</td></tr> : null}
                {!isLoading && !error ? applications.map((application) => (
                  <tr key={application.applicationId}>
                    <td><button className="queue-panel__link" type="button" onClick={() => onOpenApplication(application)}>{application.applicationNumber}</button></td>
                    <td>{application.citizen.fullName}<br /><small>{[application.citizen.city, application.citizen.state].filter(Boolean).join(", ") || "Location unavailable"}</small></td>
                    <td>{application.service.name}</td>
                    <td><span className="detail-status">{application.status}</span></td>
                    <td>{application.reviewStatus}</td>
                    <td>{formatDate(application.submittedAt)}</td>
                    <td>{application.assignedOfficer?.displayName ?? "Unassigned"}</td>
                  </tr>
                )) : null}
              </tbody>
            </table>
          </div>

          <footer className="applications-panel__footer">
            <span>Showing {applications.length} of {pagination?.total ?? 0} application records</span>
            <span className="queue-pagination">
              <button type="button" disabled={!pagination || page <= 1 || isLoading || Boolean(error)} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</button>
              <span>Page {pagination?.page ?? 1} of {pagination?.totalPages ?? 1}</span>
              <button type="button" disabled={!pagination || page >= pagination.totalPages || isLoading || Boolean(error)} onClick={() => setPage((current) => current + 1)}>Next</button>
            </span>
          </footer>
        </section>
      </main>

      <footer className="dashboard-footer">
        <span>JANSEVA-X Employee Desk</span>
        <span>Demo environment · Authorized prototype records only</span>
      </footer>
    </div>
  );
}
