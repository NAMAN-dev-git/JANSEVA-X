import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const citizenLoginUrl = import.meta.env.VITE_CITIZEN_LOGIN_URL ?? "http://localhost:5173/login";
const employeeLoginUrl = import.meta.env.VITE_EMPLOYEE_LOGIN_URL ?? "http://localhost:5174/";

function EntryPage() {
  return (
    <main className="entry-page">
      <section className="entry-card" aria-labelledby="entry-title">
        <div className="service-mark" aria-hidden="true">JX</div>
        <p className="eyebrow">GOVERNMENT SERVICE DEMO</p>
        <h1 id="entry-title">JANSEVA-X</h1>
        <p className="tagline">Your Government Application Assistant</p>

        <div className="selection" aria-labelledby="selection-title">
          <h2 id="selection-title">Select Demo Experience</h2>
          <div className="selection-actions">
            <a className="selection-link primary" href={citizenLoginUrl}>Citizen</a>
            <a className="selection-link secondary" href={employeeLoginUrl}>Employee</a>
          </div>
        </div>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <EntryPage />
  </StrictMode>,
);
