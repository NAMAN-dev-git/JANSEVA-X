import { useEffect, useState } from "react";
import { DashboardPage } from "./pages/DashboardPage";
import { LoginPage } from "./pages/LoginPage";
import { ApplicationsPage } from "./pages/ApplicationsPage";
import { ApplicationDetailsPage } from "./pages/ApplicationDetailsPage";
import { DocumentReviewPage } from "./pages/DocumentReviewPage";
import { AiPreVerificationPage } from "./pages/AiPreVerificationPage";
import { IdentityVerificationPage } from "./pages/IdentityVerificationPage";
import { ReviewPage } from "./pages/ReviewPage";
import { CompletedPage } from "./pages/CompletedPage";
import { CompletedApplicationsPage } from "./pages/CompletedApplicationsPage";
import { ProfilePage } from "./pages/ProfilePage";
import { ApiError, employeeApi } from "./lib/api";
import { clearSession, clearToken, isAuthenticated, setEmployeeSession } from "./lib/auth";
import type { CompletedApplication, QueueApplication } from "./lib/api";

type View = "login" | "dashboard" | "applications" | "application-details" | "document-review" | "ai-pre-verification" | "identity-verification" | "review" | "completed" | "completed-applications" | "profile";

export default function App() {
  const [view, setView] = useState<View>(() => isAuthenticated() ? "dashboard" : "login");
  const [sessionMessage, setSessionMessage] = useState<string | undefined>();
  const [selectedApplication, setSelectedApplication] = useState<QueueApplication | null>(null);
  const [selectedCompletedApplication, setSelectedCompletedApplication] = useState<CompletedApplication | null>(null);
  const navigateCompleted = () => setView("completed-applications");
  const navigateApplications = () => setView("applications");
  const navigateDashboard = () => setView("dashboard");
  const navigateProfile = () => setView("profile");
  const returnToLogin = () => {
    clearToken();
    clearSession();
    setSessionMessage(undefined);
    setView("login");
  };
  const handleSessionExpired = () => {
    clearToken();
    clearSession();
    setSessionMessage("Your employee session has expired or is no longer authorized. Please sign in again.");
    setView("login");
  };
  const openApplication = (application: QueueApplication) => {
    setSelectedApplication(application);
    setView("application-details");
  };

  useEffect(() => {
    if (!isAuthenticated()) return;
    let active = true;

    void employeeApi.me()
      .then((employee) => {
        if (!active || (employee.user.role !== "OFFICER" && employee.user.role !== "ADMIN")) return;
        setEmployeeSession({
          userId: employee.user.userId,
          email: employee.user.email,
          displayName: employee.user.displayName,
          role: employee.user.role,
          officer: employee.officer,
        });
      })
      .catch((error) => {
        if (!active || !(error instanceof ApiError) || (error.status !== 401 && error.status !== 403)) return;
        clearToken();
        clearSession();
        setSessionMessage("Your employee session has expired. Please sign in again.");
        setView("login");
      });

    return () => { active = false; };
  }, []);

  if (view === "login") return <LoginPage sessionMessage={sessionMessage} onSignIn={() => { setSessionMessage(undefined); navigateDashboard(); }} />;
  if (view === "dashboard") return <DashboardPage onNavigateApplications={navigateApplications} onNavigateCompleted={navigateCompleted} onNavigateProfile={navigateProfile} onOpenApplication={openApplication} onSessionExpired={handleSessionExpired} onReturnToLogin={returnToLogin} />;
  if (view === "applications") return <ApplicationsPage onOpenApplication={openApplication} onNavigateDashboard={navigateDashboard} onNavigateCompleted={navigateCompleted} onNavigateProfile={navigateProfile} onSessionExpired={handleSessionExpired} onReturnToLogin={returnToLogin} />;
  if (view === "application-details") return <ApplicationDetailsPage applicationId={selectedApplication?.applicationId ?? null} queueApplication={selectedApplication} onNavigateApplications={navigateApplications} onNavigateCompleted={navigateCompleted} onNavigateProfile={navigateProfile} onNavigateDocumentReview={() => setView("document-review")} onNavigateDashboard={navigateDashboard} onSessionExpired={handleSessionExpired} onReturnToLogin={returnToLogin} />;
  if (view === "document-review") return <DocumentReviewPage applicationId={selectedApplication?.applicationId ?? null} onNavigateAiPreVerification={() => setView("ai-pre-verification")} onNavigateApplicationDetails={() => setView("application-details")} onNavigateApplications={navigateApplications} onNavigateCompleted={navigateCompleted} onNavigateProfile={navigateProfile} onNavigateDashboard={navigateDashboard} onSessionExpired={handleSessionExpired} onReturnToLogin={returnToLogin} />;
  if (view === "ai-pre-verification") return <AiPreVerificationPage applicationId={selectedApplication?.applicationId ?? null} onNavigateDocumentReview={() => setView("document-review")} onNavigateIdentityVerification={() => setView("identity-verification")} onNavigateApplications={navigateApplications} onNavigateCompleted={navigateCompleted} onNavigateProfile={navigateProfile} onNavigateDashboard={navigateDashboard} onSessionExpired={handleSessionExpired} onReturnToLogin={returnToLogin} />;
  if (view === "identity-verification") return <IdentityVerificationPage applicationId={selectedApplication?.applicationId ?? null} onNavigateAiPreVerification={() => setView("ai-pre-verification")} onNavigateApplications={navigateApplications} onNavigateCompleted={navigateCompleted} onNavigateProfile={navigateProfile} onNavigateReview={() => setView("review")} onNavigateDashboard={navigateDashboard} onSessionExpired={handleSessionExpired} onReturnToLogin={returnToLogin} />;
  if (view === "review") return <ReviewPage applicationId={selectedApplication?.applicationId ?? null} onNavigateIdentityVerification={() => setView("identity-verification")} onNavigateApplicationDetails={() => setView("application-details")} onNavigateApplications={navigateApplications} onNavigateCompleted={navigateCompleted} onNavigateProfile={navigateProfile} onNavigateDashboard={navigateDashboard} onSessionExpired={handleSessionExpired} onReturnToLogin={returnToLogin} />;
  if (view === "completed") return <CompletedPage application={selectedCompletedApplication} onNavigateApplications={navigateApplications} onNavigateCompletedApplications={navigateCompleted} onNavigateProfile={navigateProfile} onNavigateDashboard={navigateDashboard} onReturnToLogin={returnToLogin} />;
  if (view === "completed-applications") return <CompletedApplicationsPage onOpenCompletedApplication={(application) => { setSelectedCompletedApplication(application); setView("completed"); }} onNavigateApplications={navigateApplications} onNavigateProfile={navigateProfile} onNavigateDashboard={navigateDashboard} onSessionExpired={handleSessionExpired} onReturnToLogin={returnToLogin} />;
  return <ProfilePage onNavigateApplications={navigateApplications} onNavigateCompleted={navigateCompleted} onNavigateDashboard={navigateDashboard} onReturnToLogin={returnToLogin} />;
}
