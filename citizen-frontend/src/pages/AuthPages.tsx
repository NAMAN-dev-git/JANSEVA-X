import { FormEvent, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { citizenApi } from "../api/citizen";
import { ApiError } from "../api/client";
import { useAuth } from "../app/AuthContext";
import { ErrorMessage, SuccessMessage } from "../components/Ui";

const fingerprintLoginReturnKey = "janseva-fingerprint-login-return-to";
const fingerprintPayloadPattern = /^JANSEVA-X-DEMO-FP:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function internalReturnDestination(value: string | null): string {
  if (!value?.startsWith("/") || value.startsWith("//")) return "/";
  try {
    const destination = new URL(value, window.location.origin);
    return destination.origin === window.location.origin ? `${destination.pathname}${destination.search}${destination.hash}` : "/";
  } catch {
    return "/";
  }
}

function postLoginDestination(): string {
  const fingerprintReturnTo = sessionStorage.getItem(fingerprintLoginReturnKey);
  sessionStorage.removeItem(fingerprintLoginReturnKey);
  const generalReturnTo = sessionStorage.getItem("janseva-return-to");
  sessionStorage.removeItem("janseva-return-to");
  const fallback = internalReturnDestination(generalReturnTo);
  if (!fingerprintReturnTo) return fallback;
  try {
    const destination = new URL(fingerprintReturnTo, window.location.origin);
    const payload = destination.searchParams.get("payload");
    if (destination.origin !== window.location.origin || destination.pathname !== "/verify/fingerprint" || destination.hash || destination.searchParams.size !== 1 || !payload || !fingerprintPayloadPattern.test(payload)) return fallback;
    return `${destination.pathname}${destination.search}`;
  } catch {
    return fallback;
  }
}

function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) { return <main className="auth-page"><section className="auth-intro"><div className="portal-mark">JX</div><p className="eyebrow">CITIZEN PORTAL</p><h1>JANSEVA-X</h1><p>{subtitle}</p></section><section className="auth-card"><h2>{title}</h2>{children}</section><p className="auth-footnote">JANSEVA-X is a demonstration system, not a government service.</p></main>; }

export function LoginPage() {
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [demoMobile, setDemoMobile] = useState(""); const [demoOtp, setDemoOtp] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const { setSession } = useAuth(); const navigate = useNavigate(); const location = useLocation();
  const submit = async (event: FormEvent) => { event.preventDefault(); setError(""); setBusy(true); try { const result = await citizenApi.login(email, password); if (result.user.role !== "CITIZEN") throw new Error("This portal is available to citizen accounts only."); setSession(result.user, result.tokens); navigate(postLoginDestination(), { replace: true }); } catch (caught) { setError(caught instanceof Error ? caught.message : "Sign in could not be completed."); } finally { setBusy(false); } };
  const demoSubmit = async (event: FormEvent) => { event.preventDefault(); setError(""); setBusy(true); try { const result = await citizenApi.demoLogin(demoMobile, demoOtp); setSession(result.user, result.tokens); navigate(postLoginDestination(), { replace: true }); } catch (caught) { setError(caught instanceof Error ? caught.message : "Demo sign in could not be completed."); } finally { setBusy(false); } };
  return <AuthShell title="Sign in" subtitle="Access your JANSEVA-X citizen applications and prototype workflows."><form onSubmit={submit} className="form-stack"><label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required /></label><label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required /></label><button className="button primary" disabled={busy}>{busy ? "Signing in..." : "Sign in"}</button></form><section className="demo-login"><p className="eyebrow">DEMO CITIZEN ACCESS</p><h3>Demo Mobile + OTP</h3><p>For the JANSEVA-X prototype only. No SMS is sent and no real identity verification occurs.</p><p className="demo-otp-note">Demo Mode — OTP: <strong>123456</strong></p><form onSubmit={demoSubmit} className="form-stack"><label>Demo mobile number<input value={demoMobile} onChange={(e) => setDemoMobile(e.target.value)} inputMode="numeric" autoComplete="tel" placeholder="9000000001" required /></label><label>Demo OTP<input value={demoOtp} onChange={(e) => setDemoOtp(e.target.value)} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required /></label><button className="button secondary" disabled={busy}>{busy ? "Signing in..." : "Sign in with demo profile"}</button></form></section>{error && <ErrorMessage message={error} />}<p>New to JANSEVA-X? <Link to="/register">Create a citizen account</Link></p>{location.state?.message && <SuccessMessage message={String(location.state.message)} />}</AuthShell>;
}

export function RegisterPage() {
  const [form, setForm] = useState({ fullName: "", email: "", password: "", phone: "", dateOfBirth: "", address: "", city: "", state: "", pincode: "" }); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const { setSession } = useAuth(); const navigate = useNavigate(); const update = (name: keyof typeof form, value: string) => setForm((previous) => ({ ...previous, [name]: value }));
  const submit = async (event: FormEvent) => { event.preventDefault(); setError(""); if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,}/.test(form.password)) { setError("Password must be at least 12 characters and include upper case, lower case, number, and special character."); return; } setBusy(true); try { const body = Object.fromEntries(Object.entries(form).filter(([, value]) => value !== "")); const result = await citizenApi.register(body); setSession(result.user, result.tokens); navigate("/", { replace: true }); } catch (caught) { setError(caught instanceof ApiError || caught instanceof Error ? caught.message : "Account creation could not be completed."); } finally { setBusy(false); } };
  return <AuthShell title="Create citizen account" subtitle="Register a citizen profile for JANSEVA-X prototype services."><form onSubmit={submit} className="form-stack"><div className="form-grid"><label>Full name<input value={form.fullName} onChange={(e) => update("fullName", e.target.value)} required minLength={2} /></label><label>Email<input type="email" value={form.email} onChange={(e) => update("email", e.target.value)} required /></label><label>Password<input type="password" value={form.password} onChange={(e) => update("password", e.target.value)} required minLength={12} /></label><label>Phone (optional)<input value={form.phone} onChange={(e) => update("phone", e.target.value)} inputMode="tel" /></label><label>Date of birth (optional)<input type="date" value={form.dateOfBirth} onChange={(e) => update("dateOfBirth", e.target.value)} /></label><label>Pincode (optional)<input value={form.pincode} onChange={(e) => update("pincode", e.target.value)} inputMode="numeric" pattern="[0-9]{6}" /></label><label>Address (optional)<input value={form.address} onChange={(e) => update("address", e.target.value)} /></label><label>City (optional)<input value={form.city} onChange={(e) => update("city", e.target.value)} /></label><label>State (optional)<input value={form.state} onChange={(e) => update("state", e.target.value)} /></label></div>{error && <ErrorMessage message={error} />}<button className="button primary" disabled={busy}>{busy ? "Creating account..." : "Create account"}</button><p>Already registered? <Link to="/login">Sign in</Link></p></form></AuthShell>;
}
