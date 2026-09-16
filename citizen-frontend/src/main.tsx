import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./app/AuthContext";
import { PortalLayout } from "./components/Layout";
import { Loading } from "./components/Ui";
import { LoginPage, RegisterPage } from "./pages/AuthPages";
import { ApplicationDocumentsPage, IssuedDocumentsPage, SigningPage } from "./pages/DocumentPages";
import { ApplicationDetailPage, ApplicationsPage, DashboardPage, DraftReviewPage, ProfilePage, ServiceDetailPage, ServicesPage, SubmittedPage } from "./pages/PortalPages";
import { FingerprintMobilePage, VerificationPage } from "./pages/VerificationPages";
import "./styles/index.css";

function Protected({ children }: { children: React.ReactNode }) { const { user, loading } = useAuth(); const location = useLocation(); if (loading) return <Loading label="Restoring session" />; if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />; return <>{children}</>; }
function PublicOnly({ children }: { children: React.ReactNode }) { const { user, loading } = useAuth(); if (loading) return <Loading label="Checking session" />; return user ? <Navigate to="/" replace /> : <>{children}</>; }

function App() { return <Routes><Route path="/login" element={<PublicOnly><LoginPage /></PublicOnly>} /><Route path="/register" element={<PublicOnly><RegisterPage /></PublicOnly>} /><Route path="/verify/fingerprint" element={<FingerprintMobilePage />} /><Route element={<Protected><PortalLayout /></Protected>}><Route index element={<DashboardPage />} /><Route path="services" element={<ServicesPage />} /><Route path="services/:serviceId" element={<ServiceDetailPage />} /><Route path="applications" element={<ApplicationsPage />} /><Route path="applications/:applicationId" element={<ApplicationDetailPage />} /><Route path="applications/:applicationId/documents" element={<ApplicationDocumentsPage />} /><Route path="applications/:applicationId/verify" element={<VerificationPage />} /><Route path="applications/:applicationId/review" element={<DraftReviewPage />} /><Route path="submitted/:applicationId" element={<SubmittedPage />} /><Route path="documents" element={<IssuedDocumentsPage />} /><Route path="documents/:documentId/sign" element={<SigningPage />} /><Route path="profile" element={<ProfilePage />} /></Route><Route path="*" element={<Navigate to="/" replace />} /></Routes>; }

createRoot(document.getElementById("root")!).render(<StrictMode><BrowserRouter><AuthProvider><App /></AuthProvider></BrowserRouter></StrictMode>);
