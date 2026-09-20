# JANSEVA-X Citizen Frontend ↔ Backend Contract

## Audit scope and authority

Audited on 2026-09-15 against the implementation in `citizen-backend`: Express route registration, controllers, services, validators, middleware, Prisma schema/migrations, repositories, tests, `README.md`, `API_DOCUMENTATION.md`, `package.json`, and `.env.example`.

The implementation is the source of truth. `API_DOCUMENTATION.md` is useful context but is older than the mounted routes in a few places; this contract uses the actual route/controller/service code when they differ. In particular, document download is **not** mounted, and verification routes are application- and session-scoped as specified below.

The supplied Figma design URL is `https://www.figma.com/design/1cTwZy2yeRGk925vCkllw5/JANSEVA-X?node-id=0-1`. It was unavailable to the audit environment because Figma returned `403 Forbidden` to a read-only request. Its exported visual reference, `F:\analyst_sample\JANSEVA-X citizen.pdf`, was then rendered and reviewed page-by-page; the resulting reconciliation is in [PDF design reconciliation](#pdf-design-reconciliation-21-page-audit). The only other PDF found is `citizen-backend/tests/assets/sample.pdf`, an OCR test fixture, not a design reference.

All backend integrations are prototype/demo implementations. JANSEVA-X must present this fact where users initiate or receive results from mock identity, biometric, OCR, issuance, or e-sign functionality. It must make no claim of UIDAI, PAN/CBDT, DigiLocker, real biometric, government e-KYC, government issuance, or legally valid e-sign integration.

## Runtime and integration baseline

- API base URL: frontend-configured `VITE_API_URL` environment variable, with no secrets in the frontend. Local backend base is `http://localhost:4000/api` when the backend uses its example environment.
- CORS: backend expects `CORS_ORIGIN` to include the frontend origin; the local example allows Vite development (`http://localhost:5173`) and preview (`http://localhost:4173`).
- API envelope: normal JSON responses are `{ success: true, data: ... }`. Errors are `{ success: false, error: { code, message, details? }, requestId }` (Zod validation includes `details`). `204` logout and document deletion return no body.
- Protected citizen routes require `Authorization: Bearer <accessToken>`, an active account, and JWT role `CITIZEN`. `401` requires refresh/login; `403` means an inactive account or an unsupported role.
- Access/refresh token expiry and refresh-token rotation are backend-owned. The frontend must use `/auth/refresh` only with its current refresh token and replace both tokens after a successful refresh.
- All IDs in route parameters are UUIDs. Do not construct identifiers or application numbers client-side.
- Backend rate limit: 200 requests per 15 minutes. OCR is limited to two concurrent jobs and 30 seconds per job; avoid aggressive polling and duplicate analysis requests.

## Supported citizen feature whitelist

| Feature | Backend support | API / route | Frontend allowed | Notes |
| --- | --- | --- | --- | --- |
| Health check | Yes, public | `GET /health` | No ordinary citizen screen required | Suitable only for connectivity diagnostics. |
| Register citizen account | Yes | `POST /auth/register` | Yes | Creates a `CITIZEN` user and profile and returns user + tokens. |
| Login, refresh, logout, current user | Yes | `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/me` | Yes | Citizen UI must not offer officer/admin login. |
| Citizen profile read/edit | Yes | `GET`, `PATCH /citizen/profile` | Yes | Editable profile fields only; no email/password/deactivation endpoint. |
| Service catalog | Yes, public | `GET /services`, `GET /services/:serviceId`, `GET /services/:serviceId/requirements` | Yes | Only render services returned as active. All seeded services are prototype definitions. |
| Create, list, filter, read and edit citizen application | Yes | `POST`, `GET /applications`; `GET`, `PATCH /applications/:applicationId` | Yes | Create/edit are draft-only. Application data is an opaque validated JSON object; backend has no service-specific form schema. |
| Status history / tracking | Yes | `GET /applications/:applicationId/history` and detail projection | Yes | Render server status and timestamps; do not infer approval dates or officer data. |
| Submit application | Yes | `POST /applications/:applicationId/submit` | Yes, only for `IDENTITY_VERIFIED` | The server, not client preconditions, determines validity. |
| Upload/list/get/delete citizen documents | Yes | `POST`, `GET /applications/:applicationId/documents`; `GET`, `DELETE /documents/:documentId` | Yes | Upload/delete only in `DRAFT`; use status and server errors to govern controls. |
| Download uploaded citizen document | **No mounted route** | N/A | **No** | Documentation mentions a nested download route, but the route source does not mount it. Do not render this button. |
| Document OCR/analysis and result lookup | Yes, deterministic demo | `POST /documents/:documentId/analyze`; `GET /documents/:documentId/verification` | Yes | Not authenticity/official verification; raw OCR text is not returned or persisted. |
| Mock Aadhaar and PAN checks | Yes, mock only | `POST /applications/:applicationId/verifications/aadhaar`, `/pan` | Yes | Must visibly state mock/demo; use only accepted masked/full demo input formats. |
| Mock face session | Yes, mock only | `POST /applications/:applicationId/verifications/face/start`; `POST /verifications/:verificationId/face/complete` | Yes | No face image, embedding, liveness hardware, or biometric template is collected. |
| QR-paired five-step fingerprint demonstration | Yes, mock only | fingerprint routes below | Yes | See [QR and five-finger demo contract](#qr-and-five-finger-demo-contract). No raw fingerprint capture or device fingerprint identification. |
| Mock e-KYC | Yes, mock only | `POST /applications/:applicationId/verifications/ekyc` | Yes, optional | Requires completed mock Aadhaar and PAN; does **not** drive application status. |
| Verification status summary | Yes | `GET /applications/:applicationId/verifications/summary` | Yes | Shows Aadhaar, PAN, face, fingerprint, e-KYC records or `null`. |
| List/read/download generated completion documents | Yes | `GET /applications/:applicationId/generated-documents`; `GET /generated-documents/:generatedDocumentId`; `/download` | Yes | Only citizen-owned generated documents. These are demo/prototype only. |
| Start/complete mock e-sign | Yes | `POST /generated-documents/:generatedDocumentId/signing-sessions`; `POST /generated-document-signing-sessions/:sessionId/complete` | Yes, only when server permits | Requires explicit true consent, exact server supplied consent version, and short-lived challenge. |
| Acknowledge completed signing workflow | Yes | `POST /applications/:applicationId/complete` | Yes, only when `SIGNED` | Server transitions to `COMPLETED`; repeated action is idempotent. |

## Exact API contract

### Authentication and profile

| Method and route | Authentication | Request | Successful response `data` |
| --- | --- | --- | --- |
| `POST /auth/register` | Public | `{ email, password, fullName, phone?, dateOfBirth?, address?, city?, state?, pincode? }` | `{ user, tokens }`, `201` |
| `POST /auth/login` | Public | `{ email, password }` | `{ user, tokens }` |
| `POST /auth/refresh` | Public | `{ refreshToken }` | `{ tokens }` |
| `POST /auth/logout` | Public | `{ refreshToken }` | No body, `204` |
| `GET /auth/me` | Bearer token | None | `{ user }` |
| `GET /citizen/profile` | Active citizen | None | `{ profile }` |
| `PATCH /citizen/profile` | Active citizen | One or more of `fullName`, `phone`, `dateOfBirth`, `address`, `city`, `state`, `pincode` | `{ profile }` |

Registration/profile validation: email is normalized to lower case; password is 12–128 characters and must contain lower case, upper case, number, and special character; full name is 2–200 characters; phone is 7–15 digits (optional leading `+`); date is `YYYY-MM-DD`; pincode is exactly six digits. The public `user` includes `userId`, email, role, active state, timestamps, and `citizenProfile`; tokens include `accessToken`, `refreshToken`, `tokenType: "Bearer"`, and `expiresIn`.

### Services and applications

| Method and route | Authentication | Request / query | Successful response `data` |
| --- | --- | --- | --- |
| `GET /services` | Public | None | `{ services: Service[] }` |
| `GET /services/:serviceId` | Public | UUID path parameter | `{ service: Service & { requirements } }` |
| `GET /services/:serviceId/requirements` | Public | UUID path parameter | `{ requirements }` |
| `POST /applications` | Active citizen | `{ serviceId, applicationData? }` | `{ application: ApplicationSummary }`, `201` |
| `GET /applications` | Active citizen | `page` (default 1), `limit` (1–50, default 10), `status?`, `serviceId?` | `{ applications, pagination }` |
| `GET /applications/:applicationId` | Active citizen owner | UUID path parameter | `{ application: ApplicationDetail }` |
| `PATCH /applications/:applicationId` | Active citizen owner | `{ applicationData }` | `{ application: ApplicationDetail }` |
| `POST /applications/:applicationId/submit` | Active citizen owner | `{}` | `{ applicationId, status, submittedAt, service }` |
| `GET /applications/:applicationId/history` | Active citizen owner | UUID path parameter | `{ history: [{ status, note, createdAt }] }` |
| `POST /applications/:applicationId/complete` | Active citizen owner | `{}` | `{ applicationId, status, mode }` |

`applicationData` is a non-empty JSON object (at most 50 keys/elements per object/array level, maximum depth 10; strings maximum 10,000 characters). It is not a defined application form contract. The frontend must use a generic, clearly labelled additional-details JSON/editor experience or obtain a backend-defined service form schema before offering service-specific fields. It may not invent authoritative application forms or eligibility questions.

`Service` returns `serviceId`, `name`, `slug`, `description`, `isActive`, and `isPrototype`. Requirements return `requirementId`, `serviceId`, `name`, `description`, `isRequired`, `sortOrder`, and a prototype configuration disclaimer. `ApplicationSummary` returns `applicationId`, `applicationNumber`, `service`, `status`, `createdAt`, `updatedAt`, `submittedAt`, and `latestStatusAt`. `ApplicationDetail` additionally returns `applicationData`, ordered `statusHistory`, safe document metadata, and safe generated-document tracking metadata.

### Citizen documents and document analysis

| Method and route | Authentication | Request | Successful response `data` |
| --- | --- | --- | --- |
| `POST /applications/:applicationId/documents` | Active citizen owner | Multipart form: required `file`; optional `expectedDocumentType`, `requirementId` | `{ document }`, `201` |
| `GET /applications/:applicationId/documents` | Active citizen owner | None | `{ documents }` |
| `GET /documents/:documentId` | Active citizen owner | None | `{ document }` |
| `DELETE /documents/:documentId` | Active citizen owner | None | No body, `204` |
| `POST /documents/:documentId/analyze` | Active citizen owner | `{}` | `{ document, analysis, mode }` |
| `GET /documents/:documentId/verification` | Active citizen owner | None | `{ analysis, mode }` |

Allowed `expectedDocumentType` values are `AADHAAR`, `PAN`, `TRADE_LICENCE`, `INCOME_CERTIFICATE`, `DOMICILE_CERTIFICATE`, `BIRTH_CERTIFICATE`, `PROPERTY_DOCUMENT`, `OTHER`, and `UNKNOWN`. Upload accepts only real PDF, JPG/JPEG, and PNG files, up to 10 MB, and images up to 20,000,000 pixels. A PDF over 20 pages, OCR output over 100,000 characters, OCR timeout, or malformed file can fail with a user-visible `422` error. Analysis sets document status to `PENDING_VERIFICATION` and creates a `MANUAL_REVIEW` document-verification record; it is explicitly deterministic demo analysis, not proof of document authenticity. Aadhaar/PAN analysis metadata is masked.

### Identity verification

| Method and route | Authentication | Request | Successful response `data` |
| --- | --- | --- | --- |
| `POST /applications/:applicationId/verifications/aadhaar` | Active citizen owner | `{ aadhaar }` | Verification record |
| `POST /applications/:applicationId/verifications/pan` | Active citizen owner | `{ pan }` | Verification record |
| `POST /applications/:applicationId/verifications/face/start` | Active citizen owner | `{}` | Face verification record (`IN_PROGRESS`) |
| `POST /verifications/:verificationId/face/complete` | Active citizen owner | `{}` | Face verification record (`VERIFIED`) |
| `POST /applications/:applicationId/verifications/fingerprint/start` | Active citizen owner | `{}` | Fingerprint session and, for a new/restarted session, `pairingChallenge` + `qrPayload` |
| `POST /fingerprint-sessions/:sessionId/pair` | Active citizen owner | `{ pairingChallenge }` | Fingerprint session state |
| `POST /fingerprint-sessions/:sessionId/steps/:step/complete` | Active citizen owner | `{}` | Fingerprint session state + completed step |
| `GET /fingerprint-sessions/:sessionId/status` | Active citizen owner | None | Fingerprint session state |
| `POST /applications/:applicationId/verifications/ekyc` | Active citizen owner | `{}` | e-KYC verification record |
| `GET /applications/:applicationId/verifications/summary` | Active citizen owner | None | `{ applicationId, identityVerification }` |

`aadhaar` accepts a 12-digit number in 4-digit groups/spaces/hyphens or masked `XXXX-XXXX-1234`; `pan` accepts `AAAAA9999A` or masked middle digits like `AAAAA****A`. These inputs produce deterministic demo results only. All core checks must be `VERIFIED`—Aadhaar, PAN, face, and fingerprint—for the backend to transition the application from `DRAFT` to `IDENTITY_VERIFIED`. e-KYC is optional and requires Aadhaar and PAN verification first.

### Generated documents and mock e-sign

| Method and route | Authentication | Request | Successful response `data` |
| --- | --- | --- | --- |
| `GET /applications/:applicationId/generated-documents` | Active citizen owner | None | `{ documents }` |
| `GET /generated-documents/:generatedDocumentId` | Active citizen owner | None | `{ document }` |
| `GET /generated-documents/:generatedDocumentId/download` | Active citizen owner | None | PDF attachment |
| `POST /generated-documents/:generatedDocumentId/signing-sessions` | Active citizen owner | `{}` | `{ sessionId, state, expiresAt, signingChallenge, consent, document, mode, disclaimer }`, `201` |
| `POST /generated-document-signing-sessions/:sessionId/complete` | Active citizen owner | `{ signingChallenge, consentAccepted: true, consentVersion }` | `{ sessionId, state, generatedDocumentId, applicationStatus, consentId?, mode }` |

The sole generated document type is `COMPLETION_CERTIFICATE`. Issuance is not a citizen feature: `POST /applications/:applicationId/generated-documents` is `OFFICER`/`ADMIN` only, needs `DEMO_DOCUMENT_ISSUER_ENABLED=true`, and requires an externally approved application. The citizen frontend must never call or expose it. Start-signing returns the exact consent text/version and a 10-minute challenge; the completion request must preserve that exact consent version and send `consentAccepted: true`. A completed signing session and application completion are idempotent. Signing is mock-only and has no legal validity.

## Screen → API mapping

| Screen | Backend API / local behavior | Method | Purpose | Supported |
| --- | --- | --- | --- | --- |
| Sign up | `/auth/register` | POST | Register and establish citizen session | Yes |
| Sign in | `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/me` | POST/GET | Authenticate, restore, end, and validate session | Yes |
| Service catalogue | `/services` | GET | Show only active backend services | Yes |
| Service details | `/services/:serviceId`, `/requirements` | GET | Show backend-returned prototype requirements; begin an application | Yes |
| Citizen dashboard | `/auth/me`, `/applications` | GET | Show current user and real application list/progress; no fabricated metrics | Yes |
| My applications | `/applications` | GET | Paginate/filter only owned applications | Yes |
| New application / draft editor | `/applications`, `/applications/:applicationId` | POST/PATCH/GET | Select service and save backend-supported opaque application data | Yes |
| Application detail and tracker | `/applications/:applicationId`, `/history` | GET | Read status, requirements, documents, generated docs, and timeline | Yes |
| Document manager / analysis | application document routes and `/documents/:documentId...` | POST/GET/DELETE | Upload/list/get/delete/analyse supported draft documents | Yes |
| Identity verification | application verification routes and summary | POST/GET | Perform and display mock checks | Yes |
| Mobile QR fingerprint demo | fingerprint session pair/step/status routes | POST/GET | Pair same citizen session and complete server-defined five-step mock sequence | Yes, with limitations |
| Issued demo documents | generated-document list/read/download routes | GET | Display/download actual generated certificates only | Yes |
| Mock e-sign and completion | signing session routes + application completion | POST | Consent, mock-sign actual certificate, then acknowledge completion | Yes |
| Profile | `/citizen/profile` | GET/PATCH | Read/update citizen profile | Yes |

## Button → action mapping

Only render a button when its row's preconditions are true or it is valid local navigation. Every API action must expose in-progress, success, validation, network, and backend error states.

| Button | Screen | Action / API | Supported |
| --- | --- | --- | --- |
| Create account | Sign up | `POST /auth/register` | Yes |
| Sign in | Sign in | `POST /auth/login` | Yes |
| Sign out | Authenticated header/profile | `POST /auth/logout`, then local session clear | Yes |
| Browse services | Header/dashboard | Navigate to catalogue | Yes |
| View service | Catalogue | Navigate to backend service detail | Yes |
| Start application | Service detail | `POST /applications` with backend `serviceId` | Yes |
| Save draft | Draft editor, only `DRAFT` | `PATCH /applications/:applicationId` | Yes |
| View application | Dashboard/list | Navigate to owned application detail | Yes |
| Upload document | Draft document manager | Multipart `POST /applications/:applicationId/documents` | Yes |
| Analyse document | Draft document row | `POST /documents/:documentId/analyze` | Yes |
| View analysis | Document row | `GET /documents/:documentId/verification` or local result display | Yes |
| Remove document | Draft document row | `DELETE /documents/:documentId` after confirmation | Yes |
| Verify Aadhaar/PAN | Identity screen, eligible app | Corresponding verification POST | Yes, demo only |
| Start face demo | Identity screen, eligible app | `POST .../face/start` | Yes, demo only |
| Complete face demo | Face state `IN_PROGRESS`, unexpired | `POST /verifications/:verificationId/face/complete` | Yes, demo only |
| Generate QR verification session | Identity screen, eligible app | `POST .../fingerprint/start` | Yes, demo only |
| Pair this phone | Mobile verification route, authenticated same citizen | `POST /fingerprint-sessions/:sessionId/pair` | Yes, demo only |
| Complete next demo finger | Mobile verification route, paired session | `POST /fingerprint-sessions/:sessionId/steps/:step/complete` | Yes, demo only |
| Refresh verification result | Laptop/mobile identity screen | `GET .../fingerprint-sessions/:sessionId/status` or verification summary | Yes |
| Complete mock e-KYC | Verification screen after Aadhaar + PAN | `POST .../verifications/ekyc` | Yes, demo only |
| Submit application | Detail screen only at `IDENTITY_VERIFIED` | `POST /applications/:applicationId/submit` | Yes |
| Download certificate | Existing generated document row | `GET /generated-documents/:generatedDocumentId/download` | Yes, demo document only |
| Start mock e-sign | Existing unsigned certificate on `APPROVED` application | `POST /generated-documents/:generatedDocumentId/signing-sessions` | Yes, demo only |
| Consent and complete mock e-sign | Signing screen, checked consent, unexpired session | `POST /generated-document-signing-sessions/:sessionId/complete` | Yes, demo only |
| Acknowledge completion | Detail screen only at `SIGNED` | `POST /applications/:applicationId/complete` | Yes |
| Edit profile | Profile | `PATCH /citizen/profile` | Yes |

Do not render an uploaded-document download button, certificate issuance button, approval button, status override, notification control, or any button for a route not listed above.

## Application state → UI mapping

The full Prisma enum contains additional external workflow statuses. The citizen backend's own allowed transitions are only `DRAFT → IDENTITY_VERIFIED → SUBMITTED`, `APPROVED → SIGNED`, and `SIGNED → COMPLETED`. The system may persist the statuses below, but no citizen endpoint changes `DOCUMENTS_VERIFIED`, `UNDER_REVIEW`, `CORRECTION_REQUIRED`, `APPROVED`, or `REJECTED`.

| Backend status | Citizen UI wording | Citizen actions permitted | UI constraints |
| --- | --- | --- | --- |
| `DRAFT` | Draft — complete documents and identity verification | Save application data; upload, delete, analyze documents; all verification actions; view data | Do not claim documents are accepted/verified. |
| `IDENTITY_VERIFIED` | Identity verified (demo) — ready to submit | Submit; view tracking; verification summary and optional e-KYC may remain available | Remove document mutation controls. Clearly say verification is simulated. |
| `SUBMITTED` | Submitted — awaiting external review | View tracking/history/detail; list existing generated docs | No edit, document change, approval, issuance, signing, or completion actions. |
| `DOCUMENTS_VERIFIED` | Documents verified — external workflow status | Read-only tracking | Backend provides no citizen action and no provenance/details to explain it. Do not fabricate one. |
| `UNDER_REVIEW` | Under review — external workflow status | Read-only tracking | Do not show reviewer, queue position, ETA, or officer details: none are exposed. |
| `CORRECTION_REQUIRED` | Correction required — external workflow status | Read-only tracking only | The detail projection omits `correctionReason` and backend gives no resubmission/edit route from this state. Do not show a reason, correction form, or resubmit button. |
| `APPROVED` | Approved — awaiting demo completion certificate | View tracking and existing generated documents; start mock e-sign only after an actual unsigned generated certificate exists | No citizen approval or issuance. If no certificate exists, show factual waiting state, not an issuance control. |
| `REJECTED` | Rejected — external workflow status | Read-only tracking | No appeal, complaint, reason, correction, or reapply workflow exists. |
| `SIGNED` | Demo certificate mock-signed — acknowledgement required | View/download existing certificate; acknowledge completion | State that mock e-sign is not legally valid. |
| `COMPLETED` | Completed (demo workflow) | View/download existing certificate and history | State that completion/certificate is demo/prototype, not a government decision or entitlement. |

For unknown future enum values, display the exact backend status in a neutral read-only badge and report it as an integration issue; do not invent an action.

## QR and five-finger demo contract

This is a backend-supported **demo/simulation**, not real fingerprint capture. The frontend must use exactly these server-defined steps and order:

1. On an eligible application (`DRAFT`, or `IDENTITY_VERIFIED` where the backend permits verification), call `POST /applications/:applicationId/verifications/fingerprint/start`.
2. For a new/restarted session, render a QR from backend `qrPayload`, which is exactly `JANSEVA-X-DEMO-FP:<sessionId>:<pairingChallenge>`. Use the returned `expiresAt` countdown. The payload holds only the temporary session UUID and pairing challenge—no Aadhaar/PAN, documents, fingerprint data, or other personal information.
3. The mobile route may parse the QR locally, but must require the same authenticated citizen account before it calls the backend. There is no public/anonymous pairing API.
4. Pair with `POST /fingerprint-sessions/:sessionId/pair` and `{ pairingChallenge }`. The 10-minute pairing challenge is server-validated and cannot be reused after pairing.
5. Render the following visual labels, in this exact backend sequence: `Index Finger`, `Middle Finger`, `Ring Finger`, `Little Finger`, `Thumb` (backend enum: `RIGHT_INDEX`, `RIGHT_MIDDLE`, `RIGHT_RING`, `RIGHT_PINKY`, `RIGHT_THUMB`). A user may trigger only the response's `currentStep`; each action calls `POST /fingerprint-sessions/:sessionId/steps/:step/complete` with `{}`.
6. Display `Pending → Scanning → Verified` as local visual state around each real step request. It is valid local UI state, but must not represent sensor capture. After the fifth successful response, display `5/5 Finger Verification Complete` and server-confirmed `Identity Verified` only if the core verification summary/status confirms it.
7. The laptop may poll `GET /fingerprint-sessions/:sessionId/status` at a restrained interval while visible, then refresh the application/verification summary. There is no WebSocket, webhook, push notification, or automatic cross-device result delivery endpoint.

Required visible copy: **“Demo biometric verification — simulated five-finger flow. No fingerprint images, templates, or raw biometric data are captured or stored.”** Do not request browser/device native biometric APIs because the backend does not use them and cannot validate a device fingerprint result. Do not claim to know which physical finger the device sensed; the labels represent a sequential demonstration only.

## Unsupported features and required removals

The following are absent from the mounted citizen API and must not appear as cards, nav items, buttons, disabled controls, placeholders, success messages, or claimed integrations. Remove them if present in Figma once provided.

| Unsupported feature | Why it must be removed |
| --- | --- |
| AI assistant/chat | Schema tables exist, but no chat controller or mounted citizen route exists. |
| Helpdesk, support tickets, complaints, grievance system, appeals | No citizen routes or workflow. |
| RTI | No service/workflow endpoint. |
| Benefits, schemes, eligibility, entitlement | No route or rules. |
| Payments, fees, receipts, refunds | No payment endpoint. |
| DigiLocker integration | Explicitly not implemented. |
| Real Aadhaar/UIDAI or PAN/CBDT lookup | Providers are deterministic mocks and no external systems are contacted. |
| Real face/biometric capture, raw fingerprints, fingerprint templates, biometric storage, finger identification | Explicitly prohibited by the mock provider/schema. |
| Native-phone biometric authentication as a verification claim | No backend contract for WebAuthn/native biometric assertions. |
| Notary locator or expedited processing | No endpoint. |
| Citizen analytics, performance statistics, dashboards with invented counts | No analytics endpoint. Dashboard may only derive factual data from the citizen's returned applications. |
| Notifications/inbox/read controls | Schema exists but no mounted citizen notification route. |
| Officer assignment, reviewer identity, officer queue, review actions | Backend does not expose these to citizens. |
| Approve, reject, request correction, assign, issue certificate | Officer/external responsibilities; citizen must never be offered them. |
| Application correction/re-submit experience | Although enum fields exist, no citizen route supports it; correction reason is not returned. |
| Generated-document issuance | Officer/admin-only demo bridge, feature-flagged; never show in citizen UI. |
| Uploaded-document download | No route is mounted in the actual backend. |
| General document vault for uploaded files | Listing is supported within an application, but download is not; do not imply files can be retrieved as a vault. A read-only “issued demo documents” view based on generated-document APIs is allowed. |
| Real government logos, official accreditation, legal validity claims | The backend defines a prototype and marks certificates/e-sign mock-only. |

Specific design features named in the master brief that must be removed unless a later backend audit adds support: AI Assistant, Helpdesk, Support Tickets, Complaints, Grievances, RTI, Benefits/Schemes, Payments, DigiLocker, real Aadhaar/PAN/biometric integration, Notary Locator, Expedited Processing, Analytics, unrelated services, and fake government integrations. A Figma-specific removal appendix remains blocked until the actual design reference is supplied.

## Integration blockers and implementation constraints

1. **Figma remains inaccessible, but the exported PDF was audited.** The current design reference is sufficient for frontend scope approval; use it as a visual reference only, subject to the reconciliation below.
2. **Application fields are opaque JSON.** There is no service-specific form-schema endpoint. Building distinct Trade Licence, Income Certificate, Birth Certificate, etc. form fields would invent data contracts. Use a generic application-data editor or seek a backend contract before building bespoke forms.
3. **No uploaded document download endpoint.** Do not promise a document vault/download flow for user-uploaded files. This is a backend integration blocker for that expected workflow step.
4. **Officer approval is external.** The citizen backend supplies no approval route or officer information. Frontend can track status only; end-to-end demonstration of `APPROVED` requires the separate authorized external/employee workflow or controlled test data, without frontend changes to the citizen backend.
5. **Certificate issuance needs external officer/admin action and environment enablement.** Citizen UI can list/download/sign a certificate only after it exists. It cannot make issuance happen.
6. **QR mobile pairing requires same-account authentication and polling.** There is no signed public mobile pairing endpoint, browser native biometric handoff, push, or socket. QR scanning alone cannot safely complete a session; the phone must authenticate as the citizen and the laptop must poll.
7. **No real biometric or government integration.** The five-finger flow will be a clearly-labelled visual simulation driven by mock APIs, never fingerprint capture/storage or a real identity claim.
8. **State/data gaps for external statuses.** `CORRECTION_REQUIRED`, `UNDER_REVIEW`, `DOCUMENTS_VERIFIED`, and `REJECTED` can be displayed as read-only raw statuses but lack citizen-facing rationale/actions in API responses.

## Proposed frontend folder structure (for approval; not yet created)

```text
citizen-frontend/
  src/
    app/                 # routing, providers, authenticated route guard
    api/                 # typed API client, auth refresh, endpoint modules
    components/          # accessible shared UI, status badges, API state views
    features/
      auth/
      profile/
      services/
      applications/
      documents/
      verification/     # face, QR pairing, five-step demo
      generated-documents/
    pages/               # only whitelisted screens
    hooks/
    lib/                 # validation, dates, QR parsing/generation
    styles/
    types/               # API DTOs matching this contract
  .env.example           # VITE_API_URL only; no secret
```

## Recommended implementation order (after approval)

1. Establish frontend project baseline, API URL environment configuration, typed response/error client, token refresh, route guard, and global loading/error/empty handling.
2. Implement sign-up/sign-in/sign-out/session restoration and profile.
3. Implement live catalogue/service details from the backend and application list/detail/tracking with real status rendering.
4. Implement generic draft creation/editing, then draft-only document upload/list/delete/analysis with file and OCR error states.
5. Implement identity summary and the mock Aadhaar, PAN, face, optional e-KYC flows.
6. Implement the mobile-responsive QR pairing and clearly-labelled five-step demo; poll status responsibly and refresh application status.
7. Implement identity-verified submission and read-only external review/approval tracking.
8. Implement actual generated document list/download, mock e-sign consent/session completion, and `SIGNED → COMPLETED` acknowledgement.
9. Apply the supplied Figma visual system only to this whitelist; remove every unsupported Figma element, test every visible button, and perform responsive/accessibility/API-error verification.

## Audit conclusion

The frontend can support the audited citizen lifecycle without backend changes, except that user-uploaded-document download, service-specific forms, public phone pairing/native biometric authentication, officer approval/issuance initiation, and correction handling are not supported. The exported PDF has been reconciled in this contract. The five-finger experience is approved only as a server-driven, explicitly labelled mock/demo simulation—not real fingerprint capture, storage, or identification.

## PDF design reconciliation (21-page audit)

### Global design treatment

**KEEP (visual system):** light background, white cards, restrained blue/green status treatment, serif display headings, readable body type, clear header/footer rhythm, responsive card/form layout, and the `JANSEVA-X` wordmark. These are visual choices and do not imply functionality.

**MODIFY (global chrome):** retain only `Home`, `Services`, `My Applications`, `Issued Demo Documents`, and `Profile` navigation. `Document Vault` must be renamed to **Issued Demo Documents** and limited to actual generated completion documents. A profile icon may navigate to Profile. Header/footer links for Help, Privacy, support, legal claims, and static government compliance claims must not be rendered unless real local content and navigation are later supplied.

**REMOVE (global claims):** every assertion of an official gateway, MeitY/UIDAI/NSDL/CBDT/DigiLocker integration, government registry, statutory authority, encrypted sovereign ledger, guaranteed SLA, live sync, HSM, public verification, or legal validity. The backend is a demo prototype and permits none of those claims.

### Frame-by-frame findings

| PDF page | Screen / purpose | KEEP | MODIFY | REMOVE / BLOCKED |
| --- | --- | --- | --- | --- |
| 1 | Sign in | `email` + password sign-in form, Sign up navigation, show/hide password local control. | Replace mobile-number/Aadhaar input with email. Label as JANSEVA-X prototype sign-in. Use real error/loading/session states. | **REMOVE:** Official Digital Identity Gateway, MeitY compliance, Aadhaar registration, government data-protection claims, Forgot Password (no route), Terms/Privacy/helpline links without pages. |
| 2 | Dashboard | Service, My Applications, Profile navigation; application cards populated from APIs; View Details; View All; service browsing. | Show only real profile name and real owned applications. Status badges must use exact backend statuses, not "Step 4 of 8". Rename Document Vault card to Issued Demo Documents and aggregate only actual generated documents. | **REMOVE:** AI Assistant and Launch Guidance; fake Citizen ID, verified-citizen profile badge, last-session data, three demo applications, helpdesk card/button/telephone, official-portal claims. |
| 3 | AI guidance assistant | None as a feature. | None. | **REMOVE ENTIRE SCREEN:** no AI/chat route, conversation endpoint, recommendations, service guidance, suggestions, or assistant start-application action exists. |
| 4 | Government services directory | Service catalogue card layout; card search/filter as a local UI action; backend-returned service names/descriptions; Start Application. | Render only active `GET /services` results, with returned requirements on the detail screen. Do not hard-code eight services or `SRV-01` codes. Replace processing guarantee with a plain prototype notice. | **REMOVE:** authorized-service claims, direct state-department channel, non-repudiable issuance, SSL guarantee claims. |
| 5 | PAN verification | PAN input; Verify PAN API action; local Reset; verification progress concept; proceed to next verification after a real result. | Display only server-safe mock result fields: masked PAN, taxpayer name/entity type where returned, status, timestamps, and demo notice. Progress must reflect Aadhaar, PAN, face, fingerprint, then optional e-KYC; it is application-scoped. | **REMOVE:** municipal/financial cross-validation consent, Aadhaar correlation percentage, tax-defaulter/GSTIN/municipal-quorum data, registry standing/legal rules, fake transaction details, promise of co-signed certificate. |
| 6 | Trade Licence service detail | Service detail layout, Start Application, backend requirement cards, and a concise workflow explanation. | Make this generic for every backend service. Render only returned `name`, `description`, and requirement fields. State file support as PDF/JPG/JPEG/PNG up to 10 MB. | **REMOVE:** GIS/DigiLocker, official authority, fee, SLA, fast track, legal e-sign, cross-department sharing, eligibility assessment, auto-fetch, penalties, FAQ answers/guarantees, Guidelines PDF, payments. **BLOCKED:** bespoke Trade Licence renewal data/form because no service form schema exists. |
| 7 | Face verification | A dedicated mock face verification panel, Start and Complete actions, verification status, navigation to fingerprint when verified. | Replace camera, facial photo, liveness/match scores, sensor, capture/reverify, and UIDAI language with "Demo face verification - no image, embedding, or biometric template is collected." `POST .../face/start` yields a session; Complete uses its `verificationId`. | **REMOVE:** live camera capture, government photo matching, anti-spoofing claims, model/sensor data, helpdesk. |
| 8 | Fingerprint verification | A dedicated identity verification area and completion progression. | Replace sensor output with the QR + five-step mock flow specified below. A laptop QR and a mobile-responsive pairing route replace the static scanner-success card. | **REMOVE:** optical sensor/Mantra device, quality score/NFIQ, biometric token, Aadhaar e-Vault, cryptographic consent claim, Test Scanner. **BLOCKED:** physical fingerprint scanning and native biometric identification. |
| 9 | Application form / draft review | Draft editor, Save Draft, Back navigation. | Use one generic additional-details editor backed by `applicationData`; retain only user-entered values and backend service/requirement context. Save with `PATCH /applications/:applicationId`. | **REMOVE:** trade-specific fields, auto-filled Aadhaar/PAN/registry/GIS data, immutable authority data, statutory declarations, property/tax/cadastre checks, prefilled identity values. **BLOCKED:** a service-specific government form and auto-population are not in the backend contract. |
| 10 | Digital consent & statutory declaration | The page's consent-card visual treatment may be reused later. | Do not use before submission. Re-purpose it only as a **Mock e-sign consent** screen after an approved application has an actual generated certificate and the signing-session endpoint returns its exact consent text/version. | **REMOVE AS A PRE-SUBMISSION SCREEN:** statutory terms, Aadhaar e-sign, fee, public display mandate, and "Affix consent & proceed to submission." The application submit endpoint takes `{}` and has no consent body. |
| 11 | e-KYC verification summary | Verification summary pattern and final status messaging. | Combine into the Identity Verification screen, driven by `GET /applications/:applicationId/verifications/summary`. Allow optional `POST .../verifications/ekyc` only after Aadhaar and PAN are verified. e-KYC does not make the application identity verified; all four core checks do. | **REMOVE:** face image, real biometric/minutiae results, confidence vector, government token/QR, identity snapshot, certificate download, application pre-population. |
| 12 | Document upload | Requirement-oriented upload layout, upload progress, per-file state, local Save/Return navigation. | Requirements come from the selected service. Upload each file with optional backend `requirementId` and `expectedDocumentType`; only allow draft mutations. "Replace" is Delete then Upload, not a replace API. | **REMOVE:** 5 MB limit, verified/uploaded success claims, authenticity guarantee, direct document-submission manual, vault protocol, "Continue to AI check" as a global action. **BLOCKED:** dynamic service-specific upload rules beyond the API's generic metadata. |
| 13 | AI document verification & integrity analysis | Document-analysis detail layout, extracted-field presentation, detected-issue list, Continue navigation. | Drive it from `POST /documents/:documentId/analyze` and `GET /documents/:documentId/verification`. Show returned `documentType`, confidence, fields, missing fields, detected issues, readability, recommendation, and `NOT_AVAILABLE` seal/signature results. Call it deterministic demo analysis. | **REMOVE:** real-time authenticated engine, seal/signature/authenticity/ledger validation, exact-match/official-record claims, raw telemetry export, direct re-upload (use delete then upload in `DRAFT`). |
| 14 | Aadhaar verification | Aadhaar input, Verify action, Reset local action, progress display, then navigation to PAN. | Use backend accepted full/masked demo format and show only masked returned result/status. Include explicit "Demo verification only - UIDAI was not contacted." | **REMOVE:** real UID authentication, OTP/token issuance, identity demographics pre-population, security-tier/latency claims, vault/final-submission steps. |
| 15 | Final review & application submission | Application summary, attached-document summary, a local confirmation checkbox, Submit Application, Back to draft. | Source the summary from application detail. Enable submit only at server-confirmed `IDENTITY_VERIFIED`, send `POST /applications/:applicationId/submit`, and surface a `409` meaningfully. | **REMOVE:** fee assessment/payment, municipal regulatory filing, HSM/biometric stamps, officer/legal attestation, document verification success claims, document preview if no file-download endpoint. |
| 16 | Application tracking | Status/timeline card, application identifier, service metadata, Back/View Application navigation; Print as a local browser action only if desired. | Render exact status history from detail/history and the known status mapping. External statuses are read-only and must not predict date, queue, reviewer, or outcome. | **REMOVE:** officer identity/assignment/department, SLA/expedited query, filing dossier download, verified credentials data, statutory escalation and support. **BLOCKED:** reviewer data, submitted dossier download, expedited processing. |
| 17 | Generated document / completion detail | Download actual generated PDF, filename/type/hash/signature metadata, back to applications. | Display only after `GET /applications/:applicationId/generated-documents` returns a certificate. Label the output "Demo Completion Certificate - not government-issued or legally valid." Link the e-sign action only for an actual unsigned document on an approved application. | **REMOVE:** municipal licence/certificate body, official seal, payment, officer endorsement, public verification URL/QR, central repository/vault claim, physical dispatch, support desk. |
| 18 | Correction/discrepancy response | None beyond read-only status visibility in the tracker. | A `CORRECTION_REQUIRED` status may be shown neutrally on application tracking with no rationale/actions. | **REMOVE ENTIRE SCREEN:** officer discrepancy/reason/query, deadline, replacement upload, draft/resubmit, notary locator/template, payment timeline, re-queue guarantee. **BLOCKED:** backend omits correction reason and provides no citizen correction/resubmission route; document mutation is blocked after `DRAFT`. |
| 19 | Submission success | Successful-submit confirmation, actual application number/service/submitted timestamp, Track Application and Return to Dashboard navigation. | State only that the application was submitted and is awaiting external review. A compact actual status-history view is valid. | **REMOVE:** SMS notification, estimated SLA, named review authority, acknowledgement receipt download, projected commissioner/certificate steps, support ticket. |
| 20 | Citizen document vault | Card/list visual style and search/filter as local UI. | Replace with **Issued Demo Documents**. Aggregate actual generated docs by listing applications then their generated docs; offer only View metadata, Download PDF, and eligible Mock e-sign. User-uploaded files stay in their owning application document manager with no download. | **REMOVE:** Upload New Document here, quota/count statistics, identities/credentials, XML/attested copies, public QR/share/print, audit log, external certificates, legal vault/ledger claims, HSM/statutory guarantee. **BLOCKED:** general vault and uploaded-document download. |
| 21 | Profile & account settings | Profile summary, editable name/contact/address fields, Save Preferences. | Read profile with `GET /citizen/profile`; update only supported profile fields using `PATCH /citizen/profile`. Email can be displayed from `GET /auth/me` but is not editable. | **REMOVE:** all real identity records, DigiLocker, Aadhaar/PAN/ECI/RTO lookup, biometric lock, MFA/WebAuthn/passkey, password rotation/change, notifications, affiliations, consent revocation, data archive, device sessions/logout-all, audit export. **BLOCKED:** every listed security/device/consent action has no endpoint. |

## Final retained screens

Build the following exact screen set after approval. Screens may use the PDF's card, spacing, typography, responsive, loading, empty, and error-state patterns, but only with the content/actions below.

1. Sign in and Sign up.
2. Citizen Dashboard - real profile summary, services shortcut, owned application list, issued demo documents shortcut.
3. Services Directory and generic Service Detail.
4. My Applications - paginated/filtered list.
5. Application Draft Editor - generic `applicationData`, service requirements, and draft saving.
6. Application Documents - upload/list/delete (draft-only) and document-analysis detail.
7. Identity Verification - Aadhaar, PAN, face mock flow, QR-paired five-finger mock flow, optional e-KYC, and server summary.
8. Application Review and Submit.
9. Submission confirmation and Application Tracking/Detail.
10. Issued Demo Documents - generated-document list/detail/download; only actual backend-returned documents.
11. Mock e-sign consent and completion acknowledgement - only for existing approved generated documents.
12. Profile.
13. Mobile QR Pairing / Five-Finger Demo - responsive route accessed from an authenticated same-citizen phone session.

## Screens and features to remove

Remove entirely: AI Assistant (page 3); officer discrepancy/correction screen (page 18); Helpdesk/support tickets; payments/fees/receipts; DigiLocker and every external government integration; real Aadhaar/PAN/face/fingerprint claims; native or physical biometric capture; document-vault claims and uploaded-document downloads; public verification QR; real certificate/licence rendering; officer data/actions; estimated SLA/fast track; audits, notifications, device sessions, passkeys/MFA, password reset/change, consent management, notary finder, legal/statutory compliance assertions, and all fake data/records.

## Screens to modify or combine

- Combine pages 5, 7, 8, 11, and 14 into the Identity Verification feature. Keep individual visual stages only where they call a real verification endpoint.
- Combine pages 9 and 15 into an application draft/review flow. The one allowed application payload is generic `applicationData`; do not recreate the Trade Licence form.
- Re-purpose page 10 only as the generated-document mock e-sign consent screen, after approval and document issuance; it is not application-submission consent.
- Combine pages 12 and 13 into Application Documents with a document-analysis detail state.
- Combine pages 16 and 19 into application tracking with a submit-success state.
- Re-purpose pages 17 and 20 as Issued Demo Documents, restricted to real `COMPLETION_CERTIFICATE` results. Page 17's completion detail becomes an actual generated-document detail rather than an official certificate.
- Re-purpose page 21 as a small profile editor containing only supported profile fields.

## Final screen → API map

| Final screen | Exact endpoint(s) | Purpose |
| --- | --- | --- |
| Sign up | `POST /api/auth/register` | Create citizen account and receive tokens. |
| Sign in/session | `POST /api/auth/login`, `POST /api/auth/refresh`, `POST /api/auth/logout`, `GET /api/auth/me` | Authenticate, refresh, sign out, and recover account. |
| Dashboard | `GET /api/auth/me`, `GET /api/citizen/profile`, `GET /api/applications` | Show real citizen context and owned application data. |
| Services Directory | `GET /api/services` | List active service records only. |
| Service Detail | `GET /api/services/:serviceId`, `GET /api/services/:serviceId/requirements` | Show backend service and requirement metadata. |
| Start Application | `POST /api/applications` | Create an owned `DRAFT` with `serviceId` and optional generic `applicationData`. |
| My Applications | `GET /api/applications?page=&limit=&status=&serviceId=` | List/filter owned applications. |
| Draft/Review Detail | `GET /api/applications/:applicationId`, `PATCH /api/applications/:applicationId` | Read detail and save `applicationData` while draft. |
| Documents | `POST`, `GET /api/applications/:applicationId/documents`; `GET`, `DELETE /api/documents/:documentId` | Upload/list/read/delete draft documents. |
| Document Analysis | `POST /api/documents/:documentId/analyze`, `GET /api/documents/:documentId/verification` | Perform/read deterministic demo analysis. |
| Identity Verification | `POST /api/applications/:applicationId/verifications/aadhaar`; `/pan`; `/face/start`; `POST /api/verifications/:verificationId/face/complete`; `POST /api/applications/:applicationId/verifications/ekyc`; `GET /api/applications/:applicationId/verifications/summary` | Run/read supported mock identity flows. |
| QR fingerprint laptop/mobile | `POST /api/applications/:applicationId/verifications/fingerprint/start`; `POST /api/fingerprint-sessions/:sessionId/pair`; `POST /api/fingerprint-sessions/:sessionId/steps/:step/complete`; `GET /api/fingerprint-sessions/:sessionId/status` | Create, pair, progress, and poll a demo session. |
| Submit | `POST /api/applications/:applicationId/submit` | Submit server-confirmed identity-verified application. |
| Success/Tracking | `GET /api/applications/:applicationId`, `GET /api/applications/:applicationId/history` | Display submitted response and actual status timeline. |
| Issued Demo Documents | `GET /api/applications/:applicationId/generated-documents`, `GET /api/generated-documents/:generatedDocumentId`, `GET /api/generated-documents/:generatedDocumentId/download` | List, read, and download actual generated demo documents. |
| Mock e-sign | `POST /api/generated-documents/:generatedDocumentId/signing-sessions`, `POST /api/generated-document-signing-sessions/:sessionId/complete` | Receive server consent/challenge and complete mock e-sign. |
| Completion acknowledgement | `POST /api/applications/:applicationId/complete` | Move a signed workflow to completed. |
| Profile | `GET`, `PATCH /api/citizen/profile`; `GET /api/auth/me` | Read/update supported profile data and show immutable email. |

## Final citizen user flow

```text
Register / Sign in
  -> Dashboard
  -> Browse active backend services
  -> Create DRAFT application
  -> Save generic application data and upload/analyse documents (DRAFT only)
  -> Complete mock Aadhaar, PAN, face, and QR five-finger verification
  -> Optional mock e-KYC after Aadhaar + PAN
  -> Server transitions to IDENTITY_VERIFIED
  -> Review and submit
  -> SUBMITTED: read-only tracking while external/officer review occurs
  -> APPROVED (external state only): actual demo completion certificate may appear
  -> Download and/or complete server-issued mock e-sign with explicit consent
  -> SIGNED
  -> Citizen acknowledgement
  -> COMPLETED
```

There is no citizen approval, issuance, correction, resubmission, payment, officer, support, or government-integration step.

## QR + five-finger demo placement

Place **Fingerprint demo** after the mock Face stage inside Identity Verification, replacing PDF page 8's hardware-scanner experience. The laptop identity screen has a **Start demo fingerprint session** button. Its real backend response provides `qrPayload`, `sessionId`, and expiry; render the QR without adding personal data. The phone opens a mobile-responsive JANSEVA-X route, requires the same citizen login, pairs with the challenge, and then renders exactly:

`Index Finger -> Middle Finger -> Ring Finger -> Little Finger -> Thumb`

For each server-authorized next step, show visual `Pending -> Scanning -> Verified` state around the request. After all five backend step responses succeed, show `5/5 Finger Verification Complete`, then refresh the laptop's session/verification summary. Display this persistent copy on both laptop and mobile:

> Demo biometric verification - simulated five-finger flow. No fingerprint images, templates, raw biometric data, or physical finger identity are captured or stored.

The laptop polls the authenticated status endpoint while visible; there is no push/WebSocket update. Expired sessions must show their actual expiry response and let the citizen start a new session only through the backend.

## Updated implementation order

1. Establish the application shell and typed API/auth client with real error, refresh, loading, empty, and access-denied handling.
2. Build Sign up, Sign in, session restore/sign out, and the constrained Profile editor.
3. Build Services Directory/Detail, real Dashboard, My Applications, and Application Detail/Tracker with the reconciled navigation.
4. Build generic draft editing plus draft-only document upload/list/delete and deterministic analysis.
5. Build Aadhaar, PAN, face, verification summary, and optional e-KYC mock screens.
6. Build the QR-paired mobile five-finger demo and laptop polling/status reconciliation.
7. Build review/submit and the minimal success/readonly external-review tracking states.
8. Build issued demo documents, mock e-sign consent/completion, and final completion acknowledgement.
9. Apply the PDF visual system only after every screen is matched to this contract; test every rendered button and remove all non-whitelisted design elements.

This PDF audit is complete. Do not begin frontend implementation until it is approved.
