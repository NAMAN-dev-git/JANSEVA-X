interface EmployeeHeaderProps {
  activeView: "dashboard" | "applications" | "completed" | "profile";
  onNavigateDashboard: () => void;
  onNavigateApplications: () => void;
  onNavigateCompleted: () => void;
  onNavigateProfile: () => void;
  onReturnToLogin: () => void;
}

export function EmployeeHeader({ activeView, onNavigateDashboard, onNavigateApplications, onNavigateCompleted, onNavigateProfile, onReturnToLogin }: EmployeeHeaderProps) {
  const employee = getEmployeeSession();
  const initials = (employee?.displayName ?? "Employee")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  return (
    <header className="employee-header">
      <div className="employee-header__inner">
        <div className="employee-header__brand" aria-label="JANSEVA-X Employee Desk">
          <div className="brand-icon brand-icon--header" aria-hidden="true">
            <svg viewBox="0 0 32 32" fill="none" focusable="false">
              <path d="M4.5 12.5 16 6l11.5 6.5M7 14.5h18M8.5 15v8.5m5-8.5v8.5m5-8.5v8.5m5-8.5v8.5M5.5 26h21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <p className="brand-name">JANSEVA-X</p>
            <p className="brand-subtitle">EMPLOYEE DESK</p>
          </div>
        </div>

        <nav className="employee-nav" aria-label="Employee portal navigation">
          <button className={`employee-nav__item ${activeView === "dashboard" ? "employee-nav__item--active" : ""}`} type="button" onClick={onNavigateDashboard} aria-current={activeView === "dashboard" ? "page" : undefined}>Dashboard</button>
          <button className={`employee-nav__item ${activeView === "applications" ? "employee-nav__item--active" : ""}`} type="button" onClick={onNavigateApplications} aria-current={activeView === "applications" ? "page" : undefined}>Applications</button>
          <button className={`employee-nav__item ${activeView === "completed" ? "employee-nav__item--active" : ""}`} type="button" onClick={onNavigateCompleted} aria-current={activeView === "completed" ? "page" : undefined}>Completed applications</button>
          <button className={`employee-nav__item ${activeView === "profile" ? "employee-nav__item--active" : ""}`} type="button" onClick={onNavigateProfile} aria-current={activeView === "profile" ? "page" : undefined}>Officer profile</button>
        </nav>

        <div className="employee-header__session">
          <span className="session-status"><i aria-hidden="true" />{employee ? "Authenticated" : "Session unavailable"}</span>
          <span className="session-avatar" aria-hidden="true">{initials || "ED"}</span>
          <button className="header-return" type="button" onClick={onReturnToLogin}>Sign out</button>
        </div>
      </div>
    </header>
  );
}
import { getEmployeeSession } from "../lib/auth";
