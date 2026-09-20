import { type FormEvent, useState } from "react";
import { ApiError, citizenAuthApi, employeeApi } from "../lib/api";
import { clearSession, clearToken, setEmployeeSession, setToken, type EmployeeSession } from "../lib/auth";

type LoginErrors = {
  email?: string;
  password?: string;
};

interface LoginPageProps {
  onSignIn: () => void;
  sessionMessage?: string;
}

export function LoginPage({ onSignIn, sessionMessage }: LoginPageProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<LoginErrors>({});
  const [formError, setFormError] = useState<string | null>(sessionMessage ?? null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextErrors: LoginErrors = {};
    if (!email.trim()) nextErrors.email = "Employee email is required.";
    if (!password) nextErrors.password = "Password is required.";
    setErrors(nextErrors);
    setFormError(null);

    if (Object.keys(nextErrors).length > 0) return;

    setIsSubmitting(true);
    try {
      const authentication = await citizenAuthApi.login(email.trim(), password);
      const token = authentication.tokens?.accessToken;
      if (!token) throw new ApiError("Sign-in could not be completed. Please try again.", 502, "INVALID_AUTH_RESPONSE");

      setToken(token);
      const employee = await employeeApi.me();
      if (employee.user.role !== "OFFICER" && employee.user.role !== "ADMIN") {
        throw new ApiError("Employee access is required to use this desk.", 403, "EMPLOYEE_ACCESS_REQUIRED");
      }

      const session: EmployeeSession = {
        userId: employee.user.userId,
        email: employee.user.email,
        displayName: employee.user.displayName,
        role: employee.user.role,
        officer: employee.officer,
      };
      setEmployeeSession(session);
      setPassword("");
      onSignIn();
    } catch (error) {
      clearToken();
      clearSession();
      if (error instanceof ApiError) {
        if (error.status === 401) setFormError("The email or password is not valid. Please try again.");
        else if (error.status === 403) setFormError("Employee access is required to use this desk.");
        else setFormError(error.message);
      } else {
        setFormError("Sign-in could not be completed. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="login-page">
      <header className="login-brand" aria-label="JANSEVA-X Employee Desk">
        <div className="brand-icon" aria-hidden="true">
          <svg viewBox="0 0 32 32" fill="none" focusable="false">
            <path d="M4.5 12.5 16 6l11.5 6.5M7 14.5h18M8.5 15v8.5m5-8.5v8.5m5-8.5v8.5m5-8.5v8.5M5.5 26h21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div>
          <p className="brand-name">JANSEVA-X</p>
          <p className="brand-subtitle">EMPLOYEE DESK · INTERNAL PORTAL</p>
        </div>
      </header>

      <section className="login-card" aria-labelledby="login-title">
        <div className="login-card-heading">
          <p className="eyebrow">SECURE EMPLOYEE ACCESS</p>
          <h1 id="login-title">Sign in to your desk</h1>
          <p>Use your assigned JANSEVA-X employee email to access the review workspace.</p>
        </div>

        <aside className="demo-notice" aria-label="Demo environment notice">
          <strong>DEMO / PROTOTYPE</strong>
          <span>This internal portal is for JANSEVA-X demonstration use only.</span>
        </aside>

        <form className="login-form" noValidate onSubmit={handleSubmit}>
          <div className="field-group">
            <label htmlFor="employee-email">Employee email</label>
            <input
              id="employee-email"
              name="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setErrors((current) => ({ ...current, email: undefined }));
                setFormError(null);
              }}
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? "employee-email-error" : "employee-email-help"}
              placeholder="name@jansevax.example"
            />
            {errors.email ? <p className="field-error" id="employee-email-error">{errors.email}</p> : <p className="field-help" id="employee-email-help">Use the email assigned to your employee account.</p>}
          </div>

          <div className="field-group">
            <label htmlFor="employee-password">Password</label>
            <input
              id="employee-password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                setErrors((current) => ({ ...current, password: undefined }));
                setFormError(null);
              }}
              aria-invalid={Boolean(errors.password)}
              aria-describedby={errors.password ? "employee-password-error" : undefined}
            />
            {errors.password ? <p className="field-error" id="employee-password-error">{errors.password}</p> : null}
          </div>

          {formError ? <p className="field-error" role="alert">{formError}</p> : null}
          <button className="login-submit" type="submit" disabled={isSubmitting}>{isSubmitting ? "Signing in…" : "Sign in"}</button>
          <p className="integration-notice" role="status">Sign in uses the JANSEVA-X prototype employee access flow. No real government identity or verification service is used.</p>
        </form>
      </section>

      <footer className="login-footer">
        <span>JANSEVA-X Employee Desk</span>
        <span>Demo environment · Authorized personnel only</span>
      </footer>
    </main>
  );
}
