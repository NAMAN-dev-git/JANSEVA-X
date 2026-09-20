import { EmployeeHeader } from "../components/EmployeeHeader";
import { getEmployeeSession } from "../lib/auth";

interface ProfilePageProps {
  onNavigateApplications: () => void;
  onNavigateCompleted: () => void;
  onNavigateDashboard: () => void;
  onReturnToLogin: () => void;
}

export function ProfilePage({ onNavigateApplications, onNavigateCompleted, onNavigateDashboard, onReturnToLogin }: ProfilePageProps) {
  const employee = getEmployeeSession();
  const displayName = employee?.displayName || "Authenticated employee";
  const initials = displayName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "ED";
  const officer = employee?.officer;

  return (
    <div className="dashboard-shell">
      <EmployeeHeader activeView="profile" onNavigateDashboard={onNavigateDashboard} onNavigateApplications={onNavigateApplications} onNavigateCompleted={onNavigateCompleted} onNavigateProfile={() => undefined} onReturnToLogin={onReturnToLogin} />

      <main className="profile-page">
        <section className="profile-intro" aria-labelledby="profile-title">
          <div>
            <p className="eyebrow">EMPLOYEE PROFILE - DEMO / PROTOTYPE</p>
            <h1 id="profile-title">Officer profile</h1>
            <p>This JANSEVA-X Employee Desk view shows only the safe profile fields returned by the prototype employee API. It is not connected to a government personnel system.</p>
          </div>
          <span className="preview-badge">AUTHENTICATED PROTOTYPE SESSION</span>
        </section>

        <aside className="advisory-banner" role="note">
          <strong>Safe employee session data.</strong>
          <span>Only role and profile fields returned by the prototype employee API are displayed. Profile editing and account administration are not enabled.</span>
        </aside>

        <section className="profile-identity-panel" aria-labelledby="profile-identity-title">
          <div className="profile-avatar" aria-hidden="true">{initials}</div>
          <div>
            <p className="panel-kicker">EMPLOYEE IDENTITY</p>
            <h2 id="profile-identity-title">{displayName}</h2>
            <p>{officer?.designation ?? "Designation unavailable from employee profile"}</p>
            <span>DEMO / PROTOTYPE ACCOUNT</span>
          </div>
          <div className="profile-account-state">
            <span>Account state</span>
            <strong>{employee ? "Authenticated" : "Unavailable"}</strong>
            <small>{employee ? `${employee.role} access verified` : "No employee session available"}</small>
          </div>
        </section>

        <div className="profile-grid">
          <section className="profile-panel" aria-labelledby="profile-details-title">
            <header>
              <p className="panel-kicker">PROFILE DETAILS</p>
              <h2 id="profile-details-title">Employee and role information</h2>
            </header>
            <dl className="profile-list">
              <div><dt>Employee reference</dt><dd>{officer?.employeeIdentifier ?? "Unavailable from employee profile"}</dd></div>
              <div><dt>Role</dt><dd>{employee?.role ?? "Unavailable from employee profile"}</dd></div>
              <div><dt>Department</dt><dd>{officer?.department ?? "Unavailable from employee profile"}</dd></div>
              <div><dt>Organization</dt><dd>Not provided by employee profile API — JANSEVA-X prototype</dd></div>
              <div><dt>Office context</dt><dd>Not provided by the employee profile API</dd></div>
              <div><dt>Access scope</dt><dd>{employee ? "Authenticated prototype employee access" : "Session unavailable"}</dd></div>
            </dl>
          </section>

          <section className="profile-panel" aria-labelledby="profile-security-title">
            <header>
              <p className="panel-kicker">ACCOUNT STATUS</p>
              <h2 id="profile-security-title">Preview access information</h2>
            </header>
            <div className="profile-status-list">
              <div><span>Authentication</span><strong>{employee ? "Connected prototype session" : "Unavailable"}</strong></div>
              <div><span>Employee directory</span><strong>Not connected</strong></div>
              <div><span>Signing authority</span><strong>Not available in preview</strong></div>
              <div><span>Profile editing</span><strong>Disabled</strong></div>
            </div>
            <p className="profile-panel__note">No passwords, signing certificates, personnel records, biometric data, or government identity data are loaded or changed from this screen.</p>
          </section>
        </div>

        <section className="profile-actions" aria-labelledby="profile-actions-title">
          <div>
            <p className="panel-kicker">PROFILE CONTROLS</p>
            <h2 id="profile-actions-title">Profile management</h2>
            <p>Profile editing is intentionally unavailable in this prototype.</p>
          </div>
          <button type="button" disabled>Edit profile unavailable</button>
        </section>
      </main>

      <footer className="dashboard-footer">
        <span>JANSEVA-X Employee Desk</span>
        <span>Demo environment - Safe employee profile fields only</span>
      </footer>
    </div>
  );
}
