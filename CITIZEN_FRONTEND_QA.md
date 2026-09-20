# JANSEVA-X Citizen Frontend QA Audit

Audited on 2026-09-15 against the full `FRONTEND_BACKEND_CONTRACT.md`, the implemented `citizen-frontend` source, mounted Citizen Backend routes/controllers, and the rendered 21-page `JANSEVA-X citizen.pdf` reference.

## Overall status

**PASS WITH BLOCKERS**

The frontend implements only the contract-approved citizen feature set. TypeScript and the production bundle pass. A running configured backend/database and externally driven approval/issuance state were not available during this audit, so full authenticated API workflow execution remains externally blocked; no backend was changed to simulate it.

## Screens audited

| Screen | Status | QA result |
| --- | --- | --- |
| Sign in | PASS | Citizen-only sign-in, validation, errors, session restore and redirect are implemented. |
| Sign up | PASS | Contract fields and password checks match the registration contract. |
| Dashboard | PASS | Uses real profile/application data; no fabricated statistics. |
| Services directory | PASS | Shows only active API-returned services; search is a local filter. |
| Service detail / start application | PASS | Uses returned service requirements and creates only a draft application. |
| My Applications | PASS | Uses owned-application pagination and server status filtering. |
| Draft editor | PASS | Generic non-empty JSON `applicationData` only; no invented service form. |
| Application detail / tracking | PASS | Server status/history is read-only except for the contract-approved citizen actions. |
| Application documents / analysis | PASS | Draft-only upload/delete/analyse controls; no uploaded-file download control. |
| Identity verification | PASS | Mock Aadhaar, PAN, face, optional e-KYC, server summary and status gating are present. |
| Laptop QR fingerprint demo | FIXED | Expired sessions now offer a new backend-created demo session and start requests have an in-progress state. |
| Mobile QR five-finger demo | PASS | Same-citizen authentication, pairing, server-authorized step order, expiry/error states and completion state are present. |
| Review / submit / submission success | PASS | Submit is rendered only at `IDENTITY_VERIFIED`; success leads to read-only tracking. |
| Issued Demo Documents | PASS | Lists actual generated documents only; download is limited to generated PDFs. |
| Mock e-sign / completion acknowledgement | FIXED | Uses exact server consent/version/challenge; fallback navigation now returns to Issued Demo Documents instead of constructing an invalid application route. |
| Profile | PASS | Reads and updates only contract-approved profile fields; email/security settings are not exposed. |

All API-driven screens remain **BLOCKED for live end-to-end confirmation** until the existing backend and database are started with a citizen account. This is an external integration prerequisite, not a frontend failure.

## Contract and API integration audit

| Area | Status | Verified behavior |
| --- | --- | --- |
| Authentication | PASS | `register`, `login`, `refresh`, `logout`, `me`; bearer token use, refresh-token rotation handling and session clearing on failed refresh. |
| Profile | PASS | `GET`/`PATCH /citizen/profile` with only allowed profile fields. |
| Catalogue | PASS | `GET /services`, `GET /services/:serviceId`; requirements come from the service detail response. |
| Applications | PASS | Create/list/detail/update/history/submit/complete methods and bodies match the contract. |
| Documents / OCR | PASS | Multipart upload, list/get/delete/analyse/analysis-result use only mounted routes. No uploaded-document download method exists. |
| Mock identity | PASS | Aadhaar, PAN, face start/complete, e-KYC and summary paths/methods match mounted routes. |
| QR fingerprint demo | PASS | Start/pair/step/status paths match backend source; QR payload is parsed as `JANSEVA-X-DEMO-FP:<session UUID>:<challenge UUID>`. |
| Generated documents | PASS | List/detail/download use citizen-owned generated-document routes only. |
| Mock e-sign | PASS | Start and complete calls preserve the server-provided signing challenge and consent version. |
| Download authentication | FIXED | Generated-PDF download now refreshes an expired access token once before clearing the session. |

No frontend call targets the officer/admin issuance route, an unmounted uploaded-document download route, or an unsupported backend API.

## Application lifecycle audit

The UI maps and gates the lifecycle exactly as required:

`DRAFT -> IDENTITY_VERIFIED -> SUBMITTED -> APPROVED -> SIGNED -> COMPLETED`

- Draft-only: generic JSON editing and document mutation.
- Identity verification is a mock workflow; only server status permits review/submit.
- Submitted/under-review/approved states expose no officer controls, approval controls, correction workflow, or predicted outcome.
- `SIGNED` alone exposes the citizen acknowledgement action; the backend owns the actual transition.
- Certificate issuance and approval remain external/officer-owned and read-only to the citizen.

## PDF design comparison

The PDF was rendered page-by-page for visual review. The implemented portal preserves the approved light professional system: white cards, restrained blue actions, serif headings, header/footer, status pills, form/card patterns, timeline, document rows, verification panels, QR presentation, and responsive breakpoints.

The following PDF-only content remains intentionally absent: the AI assistant, trade-licence-specific form, physical camera/fingerprint scanner UI, payment/fee journeys, officer discrepancy page, support/helpdesk, statutory claims, official seals, general document vault, government-record lookups, and account-security controls.

## Unsupported features confirmed removed

- AI assistant, helpdesk, support tickets, complaints, grievances and RTI.
- Payments, fees, receipts, expedited processing and SLA promises.
- DigiLocker, UIDAI/PAN/CBDT connections, real e-KYC, government records and government issuance claims.
- Camera capture, native biometrics, physical scanners, fingerprint images/templates and biometric storage.
- Officer approval/issuance/review controls, correction/resubmission workflows and reviewer data.
- Uploaded-document download, general vault, public verification QR, fake statistics and fake records.
- Notary locator, analytics, MFA/passkeys, device sessions, password/security management and notification controls.

## QR + five-finger demo

**PASS**

- Laptop starts only the contract-supported mock fingerprint session.
- QR encodes only the temporary session ID and pairing challenge; it contains no Aadhaar, PAN, document, fingerprint-image, or template data.
- The phone route requires the same logged-in citizen, retrieves the server session, pairs it, and completes only the server-provided next step.
- The visible order is `Index Finger -> Middle Finger -> Ring Finger -> Little Finger -> Thumb`, matching backend `FingerprintStep` order.
- Pending, Scanning and Verified presentation is included; completion shows `5/5 Finger Verification Complete`.
- Laptop polls the authenticated status endpoint while a session is active; mobile shows invalid/expired-session errors.
- Laptop expiry recovery was fixed to start a new short-lived backend session.
- Laptop and mobile permanently state that this is a simulated demo and that no fingerprint images, templates, raw biometric data, or physical finger identity are captured or stored.

## Responsive QA

| Viewport | Status | Result |
| --- | --- | --- |
| Desktop | PASS | Multi-column cards, header navigation, QR panel and timelines use bounded page widths. |
| Tablet | PASS | 850px rules reduce service/summary grids and preserve horizontally reachable navigation. |
| Mobile | PASS | 620px rules stack cards/forms/actions/QR panels; the mobile pairing route uses a dedicated bounded single-column layout. |

No image assets are referenced by the implementation, so there are no missing-image or missing-icon dependencies. Browser-console inspection and live API interaction remain blocked by the unavailable authenticated backend environment.

## Issues found and fixed

1. **Expired laptop fingerprint session had no restart action.** Fixed by rendering `Start a new demo fingerprint session` only for a server-reported `EXPIRED` session; it calls the existing fingerprint-start endpoint.
2. **Generated PDF downloads did not retry after access-token expiry.** Fixed by reusing the existing one-time refresh-token flow before failing and clearing the session.
3. **Direct mock e-sign completion could navigate to a generated-document ID as if it were an application ID.** Fixed by returning to Issued Demo Documents when the optional application query parameter is absent.

## Validation

| Check | Command | Result |
| --- | --- | --- |
| Typecheck + production build | `npm run build` | PASS - `tsc -b` and Vite completed successfully. |
| Vite smoke server | `npm run dev -- --host 127.0.0.1` | PASS - Vite served the application shell. The temporary server was stopped after testing. |
| SPA route smoke | `curl.exe http://127.0.0.1:5173/`, `/login`, `/verify/fingerprint` | PASS - root shell returned; direct SPA routes returned HTTP 200. |
| Lint | N/A | No lint script is defined in `package.json`. |
| Tests | N/A | No frontend test script/framework is defined in `package.json`. |
| Diff hygiene | `git diff --check` | PASS - no whitespace errors. |

## Remaining blockers

1. Full authenticated API workflow QA needs the existing Citizen Backend and its database configured/running with CORS for the frontend. The frontend does not alter backend configuration to bypass this.
2. The `APPROVED` -> generated certificate -> mock e-sign path requires external officer/admin approval and enabled demo issuance. The citizen frontend correctly has no ability to create that state.

