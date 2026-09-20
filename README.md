# JANSEVA-X

## Your Government Application Assistant

JANSEVA-X is a consent-based government-application intelligence layer built as a hackathon prototype. It demonstrates conversational service discovery, consented preparation, mock identity checks, submission tracking, employee review, prototype document issuance, mock e-sign, and completion.

> **DEMO / PROTOTYPE ONLY** — all data and providers are synthetic. JANSEVA-X does not contact Aadhaar, PAN, UIDAI, CBDT, DigiLocker, a government registry, a biometric/e-KYC/e-sign provider, or a payment provider.

## Quick demo

1. Start PostgreSQL and the four services below.
2. Sign in to the Citizen Portal and say or type: **“I need to renew my trade licence.”**
3. Consent to preparation; show Smart Fill, Smart Attach, and the mock identity demonstrations.
4. Submit the application, then use the Employee Portal to claim, review, approve, and issue the prototype document.
5. Return as the citizen to complete mock e-sign and acknowledgement.

For the full live script, including the QR phone scanner, see [Demo Runbook](docs/DEMO_RUNBOOK.md). For lifecycle, architecture, security, routes, and data boundaries, see [Technical Documentation](docs/TECHNICAL_DOCUMENTATION.md).

## Demo credentials

**DEMO / SYNTHETIC CREDENTIALS ONLY**

| Portal | Email | Password | Role |
| --- | --- | --- | --- |
| Citizen | `rahul.sharma.demo@jansevax.test` | `DemoPassword123!` | Citizen |
| Employee | `demo.officer@jansevax.test` | `DemoPassword123!` | OFFICER |

The seeded mock OTP is `123456`; it is only for the demo-login path.

## Start locally

Requirements: Node.js 20+, npm, PostgreSQL 14+, and Chrome/Chromium for the voice demo. The fingerprint demo also needs a phone on the same LAN as the PC. There is no Dockerfile or Docker Compose configuration; provide PostgreSQL separately.

Prepare a fresh local database from `citizen-backend`:

```powershell
npm ci
npm run prisma:generate
npx prisma migrate deploy
npm run prisma:seed
```

Start each service in its own terminal from the repository root:

```powershell
# Citizen backend — 4000
Set-Location citizen-backend; npm run dev
# Citizen frontend — 5173
Set-Location citizen-frontend; npm run dev
# Employee backend — 4001
Set-Location employee-backend; npm run dev
# Employee frontend — 5174
Set-Location employee-frontend; npm run dev
```

Copy each `.env.example` to a local `.env` first, configure PostgreSQL and development JWT values, and keep the two backend JWT secrets aligned. Full setup, LAN, and troubleshooting details are in the [Demo Runbook](docs/DEMO_RUNBOOK.md).

## Current prototype scope

- JANSEVA AI voice/text discovery, consented Smart Fill/Smart Attach, and automatic supported-application opening.
- Mock Aadhaar, PAN, face, e-KYC, and deterministic QR-paired five-finger fingerprint demonstrations.
- Durable submission tickets, employee review, prototype generated documents, mock e-sign, and completion.
- SSC CGL demo applications with IndexedDB drafts and offline submission intents.

No real fingerprint or biometric data is captured, transmitted, matched, or stored. Scanner hashes/challenge fragments are synthetic presentation data; the backend session state is authoritative.

## Guides

- [Technical Documentation](docs/TECHNICAL_DOCUMENTATION.md)
- [Demo Runbook](docs/DEMO_RUNBOOK.md)
- [Citizen backend API documentation](citizen-backend/API_DOCUMENTATION.md)
- [Frontend/backend contract](docs/FRONTEND_BACKEND_CONTRACT.md)
