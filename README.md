# JANSEVA-X

## Your Government Application Assistant

JANSEVA-X is a consent-based application intelligence layer that guides supported government application journeys. This hackathon prototype demonstrates citizen preparation and tracking alongside officer-led review and completion.

## Key Demo Flow

**Citizen:** Intent → Service → Consent → Smart Fill → Smart Attach → Mock Verification → Submit/Draft → Tracking

**Employee:** Queue → Claim → Document Review → AI Advisory → Identity Review → Approve/Correction/Reject → Mock E-Sign → Completion

The Employee workflow hands approved applications to the Citizen Portal for the mock e-sign and completion steps. AI guidance is advisory; final application decisions remain officer-owned.

## Prototype Status and Boundaries

> **DEMO / PROTOTYPE ONLY** — all people, records, documents, decisions, and providers use synthetic demo data.

- Aadhaar, PAN, e-KYC, face, fingerprint, issued-document, and e-sign components are mock prototype components.
- JANSEVA-X has no real UIDAI/Aadhaar/PAN integration, biometric provider, government registry, payment provider, or legal e-sign integration.
- No real biometric sample, fingerprint image, template, minutiae, or biometric match is captured, stored, transmitted, or used.
- Prototype generated documents and verification output have no legal or government validity.
- Production integrations, infrastructure, security/compliance work, and operational controls are future work.

## Project Structure

| Directory | Purpose |
| --- | --- |
| `citizen-frontend` | React/Vite Citizen Portal, including JANSEVA AI, application journeys, mock verification, and tracking. |
| `citizen-backend` | Citizen API, Prisma schema/migrations/seeds, mock providers, submission processing, documents, and mock signing. |
| `employee-frontend` | React/Vite Employee Desk for queue management and application review. |
| `employee-backend` | Employee API, authorization, review actions, and document-issuance bridge. |
| `entry-frontend` | Unified starting page for selecting the Citizen or Employee demo experience. |
| `docs` | Technical documentation and live-demo runbook. |
| `shared` | Shared API and data-contract documentation. |

## Technology Stack

- TypeScript, React, React Router, and Vite
- Node.js and Express
- PostgreSQL and Prisma
- JSON Web Tokens, Zod, Helmet, CORS, and rate limiting
- Tesseract.js, PDF parsing/generation utilities, browser IndexedDB, and browser speech recognition where available

## Architecture

The Citizen and Employee frontends are separate React/Vite applications with their own Express/TypeScript backends. Both backends use the same PostgreSQL/Prisma application records; the Employee service reviews and acts on the shared workflow rather than maintaining a separate employee database.

`entry-frontend` provides a simple browser navigation point to the two frontends. Mock identity, document, fingerprint, and signing providers remain inside the prototype boundary and do not connect to live government or biometric systems.

## Unified Demo Entry

Run `entry-frontend` to start from one selection page:

- **Citizen** opens the existing Citizen login.
- **Employee** opens the existing Employee entry/login.

The configured local entry URL is [http://localhost:5172/](http://localhost:5172/). The entry app defaults to the local Citizen and Employee targets and supports `VITE_CITIZEN_LOGIN_URL` and `VITE_EMPLOYEE_LOGIN_URL` for separately hosted deployments; configure those public URLs at build time when hosting.

## Running Locally

### Prerequisites

Node.js 20+, npm, PostgreSQL 14+, and Chrome/Chromium for the voice demonstration. The fingerprint demonstration also requires a phone and PC on the same LAN. PostgreSQL must be provided separately; this repository has no Dockerfile or Docker Compose configuration.

Copy the relevant `.env.example` files to local `.env` files, configure PostgreSQL and development JWT values, and keep both backend JWT secrets aligned. Do not commit `.env` files.

### Install and prepare the database

From the repository root, install dependencies and prepare the shared database:

```powershell
Set-Location citizen-backend
npm ci
npm run prisma:generate
npx prisma migrate deploy
npm run prisma:seed

Set-Location ../employee-backend; npm ci; npm run prisma:generate
Set-Location ../citizen-frontend; npm ci
Set-Location ../employee-frontend; npm ci
Set-Location ../entry-frontend; npm ci
```

### Start the services

Start each command in its own terminal from the repository root:

```powershell
# Unified demo entry — 5172
Set-Location entry-frontend; npm run dev

# Citizen API — 4000
Set-Location citizen-backend; npm run dev

# Citizen Portal — 5173
Set-Location citizen-frontend; npm run dev

# Employee API — 4001
Set-Location employee-backend; npm run dev

# Employee Desk — 5174
Set-Location employee-frontend; npm run dev
```

Open [http://localhost:5172/](http://localhost:5172/) and select a demo experience. The direct portal URLs are [Citizen Portal](http://localhost:5173/login) and [Employee Desk](http://localhost:5174/).

For LAN fingerprint testing, configure the Citizen frontend and backend with the PC's current LAN address rather than `localhost`; see the [Demo Runbook](docs/DEMO_RUNBOOK.md).

## Demo Credentials

**DEMO / SYNTHETIC CREDENTIALS ONLY**

| Portal | Email | Password | Role |
| --- | --- | --- | --- |
| Citizen | `rahul.sharma.demo@jansevax.test` | `DemoPassword123!` | Citizen |
| Employee | `demo.officer@jansevax.test` | `DemoPassword123!` | OFFICER |

The seeded mock demo-login OTP is `123456`.

## Additional Prototype Coverage

- JANSEVA AI voice/text service discovery and consented Smart Fill/Smart Attach
- Mock Aadhaar, PAN, face, e-KYC, and deterministic QR-paired five-finger fingerprint demonstrations
- Durable submission tickets, employee review, prototype document issuance, mock e-sign, and completion
- Fictional SSC CGL demo applications with IndexedDB drafts and offline submission intents

## Documentation

- [Technical Documentation](docs/TECHNICAL_DOCUMENTATION.md)
- [Demo Runbook](docs/DEMO_RUNBOOK.md)
- [Citizen Backend API Documentation](citizen-backend/API_DOCUMENTATION.md)
- [Frontend/Backend Contract](docs/FRONTEND_BACKEND_CONTRACT.md)
- [Shared API and Data Contract](shared/API_CONTRACT.md)

## Hackathon Submission Note

JANSEVA-X is a hackathon prototype demonstrating a consent-based application journey and officer-owned review boundary. Current functionality is intentionally synthetic and mock-based; live government/provider integrations, legal signing, payment processing, production operations, and formal security/compliance work are future roadmap items.
