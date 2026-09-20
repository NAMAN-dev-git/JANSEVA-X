# JANSEVA-X Demo Runbook

## Prerequisites and startup

Use Node.js 20+, npm, PostgreSQL 14+, and Chrome/Chromium for voice input. The fingerprint demonstration needs a phone and PC on the same LAN. This repository has no Dockerfile or Docker Compose configuration; PostgreSQL must be provided separately.

Copy each `.env.example` to a local `.env`, configure the database and development JWT values, and keep both backend JWT secrets aligned. Do not commit `.env` files.

Prepare a fresh local Citizen database:

```powershell
Set-Location citizen-backend
npm ci
npm run prisma:generate
npx prisma migrate deploy
npm run prisma:seed
```

Install Employee backend dependencies before its Prisma-link step, then install both frontends:

```powershell
Set-Location ../employee-backend; npm ci; npm run prisma:generate
Set-Location ../citizen-frontend; npm ci
Set-Location ../employee-frontend; npm ci
```

Start four terminals from the repository root:

```powershell
# Terminal 1 — Citizen backend, 4000
Set-Location citizen-backend; npm run dev
# Terminal 2 — Citizen frontend, 5173
Set-Location citizen-frontend; npm run dev
# Terminal 3 — Employee backend, 4001
Set-Location employee-backend; npm run dev
# Terminal 4 — Employee frontend, 5174
Set-Location employee-frontend; npm run dev
```

Citizen Portal: `http://localhost:5173` · Employee Portal: `http://localhost:5174`

## Demo credentials

**DEMO / SYNTHETIC ONLY**

| User | Email | Password | Role |
| --- | --- | --- | --- |
| Rahul Sharma | `rahul.sharma.demo@jansevax.test` | `DemoPassword123!` | Citizen |
| Demo Officer | `demo.officer@jansevax.test` | `DemoPassword123!` | OFFICER |

Mock demo-login OTP: `123456`.

## Citizen Trade Licence demo

1. Sign in as Rahul Sharma and open **JANSEVA AI**.
2. Say/type: **“I need to renew my trade licence.”**
3. Confirm preparation consent with **“Yes, help prepare.”**
4. Show Smart Fill, then Smart Attach of available issued demo documents.
5. Open **Identity Verification**; complete mock Aadhaar/PAN, mock e-KYC, and face demonstration.
6. Run the fingerprint sequence below.
7. After verification, JANSEVA AI asks whether to submit or save draft.
8. **Submit** creates a durable ticket and moves the application to `SUBMITTED` for Employee review; the ticket independently becomes `PENDING`, `PROCESSING`, then `COMPLETED` or `FAILED`. **Save draft** leaves it in draft state.
9. After Employee approval/issuance, return as the citizen for mock e-sign and acknowledgement to reach `SIGNED` then `COMPLETED`.

## Fingerprint phone demo

The phone must never use `localhost` for the PC backend. Use the PC's current LAN address; do not hard-code a previous private IP.

```dotenv
# citizen-frontend/.env
VITE_PUBLIC_LAN_URL=http://<PC-LAN-HOST>:5173
VITE_API_URL=http://<PC-LAN-HOST>:4000/api

# citizen-backend/.env: include the LAN frontend origin explicitly
CORS_ORIGIN=http://<PC-LAN-HOST>:5173,http://localhost:5173,http://localhost:5174
```

Restart the Citizen backend/Vite after configuration changes. Ensure the private Windows network/firewall profile allows the phone to reach ports 5173 and 4000.

**PC:** Trade Licence → Identity Verification → **Start demo fingerprint session** → QR.

**Phone:** scan QR → companion/login → sign in as the same citizen → return to the same session → pair → press and hold the scanner → scanning/processing plus synthetic demo values → complete right index, middle, ring, pinky, and thumb → **Fingerprint verification complete**.

**PC:** the Portal receives authoritative backend session status and updates fingerprint verification.

No real biometric hardware, data, provider, or matching is used.

## Employee demo

1. Sign in as Demo Officer.
2. Dashboard → Application Queue → open the submitted application → **Claim**.
3. Open Document Review, AI Pre-verification, and Identity Verification.
4. Open Officer Review → **Start Review**.

### Approve

Approve → **Issue generated document** (requires `DEMO_DOCUMENT_ISSUER_ENABLED=true`) → citizen mock e-sign → `SIGNED` → citizen acknowledgement → `COMPLETED`.

### Request correction

Request Correction → `CORRECTION_REQUIRED` → Citizen Portal shows the correction-required result and supported continuation path.

### Reject

Reject → `REJECTED` → Citizen Portal shows the rejected result.

**AI is advisory. Final decisions remain officer-owned.**

## Judge script: 3–5 minutes

1. Voice discovery: “I need to renew my trade licence.”
2. Consent, Smart Fill, and Smart Attach.
3. Mock identity, then QR fingerprint companion.
4. Submit and show the durable ticket.
5. Employee claim/review/approve and document issuance.
6. Citizen mock e-sign and completed status.

Show correction/reject as separate branches rather than applying multiple final decisions to one application.

## Troubleshooting

| Issue | Check |
| --- | --- |
| PostgreSQL/backend startup error | Confirm PostgreSQL is running and both backend `DATABASE_URL` values target the intended database. |
| Port conflict | Do not start a duplicate service. Reuse a healthy service or stop only the process owning that exact port. |
| QR/phone cannot connect | Confirm same LAN, current `VITE_PUBLIC_LAN_URL`, reachable Citizen frontend/backend, and private Windows firewall access. |
| Mobile Network error | Check LAN `VITE_API_URL`, backend reachability at `http://<PC-LAN-HOST>:4000/api/health`, CORS origin, binding, and stale IPs. |
| Expired QR session | Start a new session on the PC; pairing challenges are temporary. |
| Stale browser UI | Hard reload. In a production Citizen build, clear site data/unregister an old service worker before retesting. |
| Windows EPERM/file lock | Close the process holding the file; do not delete `node_modules` blindly. |

## Prototype reminder

No real government application, identity verification, registry lookup, biometric capture, payment, e-KYC, e-sign, or certificate issuance occurs.
