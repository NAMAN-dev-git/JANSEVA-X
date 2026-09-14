# JANSEVA-X Citizen Backend API

Base path: `/api`. JSON responses use the existing `{ success, message, data }` envelope. Validation and authorization failures return the shared error envelope with an appropriate HTTP status.

## Authentication and access

| Route | Method | Notes |
| --- | --- | --- |
| `/auth/register` | `POST` | Register a citizen account. |
| `/auth/login` | `POST` | Obtain access and refresh tokens. |
| `/auth/refresh` | `POST` | Rotate a valid refresh token. |
| `/auth/logout` | `POST` | Revoke the supplied refresh token. |
| `/auth/me` | `GET` | Return the current authenticated account. |
| `/services` | `GET` | Public service catalog. |
| `/services/:serviceId` | `GET` | Public service detail. |

Use `Authorization: Bearer <access-token>` for protected endpoints. Protected citizen endpoints require a currently active account with the `CITIZEN` role. An account deactivated after token issue is rejected; client-side token presence is not authorization.

## Application lifecycle

`DRAFT` -> documents uploaded/analyzed -> identity verification -> `IDENTITY_VERIFIED` -> submitted -> `SUBMITTED` -> **external/officer review boundary** -> `APPROVED` -> demo certificate issuance -> mock e-sign -> `SIGNED` -> citizen completion -> `COMPLETED`

`APPROVED` is owned by an external/officer workflow. The citizen backend deliberately provides no public citizen approval endpoint. Integration and end-to-end tests establish that state only with controlled fixtures/fakes.

### Citizen application routes

| Route | Method | Request / behavior |
| --- | --- | --- |
| `/applications` | `POST` | Create a citizen-owned `DRAFT` application. |
| `/applications` | `GET` | List only the caller's applications. |
| `/applications/:applicationId` | `GET` | Get a caller-owned application, its safe document summary, status history, and safe generated-document tracking projection. |
| `/applications/:applicationId/submit` | `POST` | Submit only an `IDENTITY_VERIFIED` application. |
| `/applications/:applicationId/complete` | `POST` | Acknowledge only a caller-owned `SIGNED` application; repeated completion is idempotent. |

The application-detail generated-document projection includes only tracking metadata such as document type, filename, integrity hash/algorithm, signature state, and timestamps. It never exposes storage keys, signing challenges, provider references, consent internals, or signing-session data.

## Citizen documents

All routes below require ownership of `:applicationId`. Upload, delete, and analysis are permitted only in `DRAFT`; they are blocked after identity verification, submission, approval, signing, or completion.

| Route | Method | Request / behavior |
| --- | --- | --- |
| `/applications/:applicationId/documents` | `POST` | Multipart `file` upload with the supported document metadata. |
| `/applications/:applicationId/documents` | `GET` | List the caller's document metadata. |
| `/applications/:applicationId/documents/:documentId` | `GET` | Get caller-owned document metadata. |
| `/applications/:applicationId/documents/:documentId/download` | `GET` | Download caller-owned stored file. |
| `/applications/:applicationId/documents/:documentId` | `DELETE` | Delete a caller-owned draft document. |
| `/applications/:applicationId/documents/:documentId/analyze` | `POST` | Run the mock OCR analysis for a caller-owned draft document. |

OCR is prototype-only. Persisted analysis is bounded and masks Aadhaar/PAN identifiers; it does not retain raw OCR text.

## Mock identity verification

All identity providers are **MOCK / DEMO** only and do not call real identity, biometric, or e-KYC systems.

| Route | Method | Purpose |
| --- | --- | --- |
| `/verification/aadhaar` | `POST` | Mock Aadhaar verification for a caller-owned draft application. |
| `/verification/pan` | `POST` | Mock PAN verification for a caller-owned draft application. |
| `/verification/face` | `POST` | Mock face verification. |
| `/verification/fingerprint` | `POST` | Mock fingerprint verification. |
| `/verification/ekyc` | `POST` | Mock e-KYC completion. |
| `/verification/:applicationId` | `GET` | Caller-owned identity verification status. |

Once the configured checks are complete, the application moves from `DRAFT` to `IDENTITY_VERIFIED`. Repeating a completed check is safe; verification cannot be started after submission.

## Demo generated completion documents

`COMPLETION_CERTIFICATE` is the sole required generated document in this prototype. Issuance and e-sign remain **DEMO / PROTOTYPE** only and have no legal validity.

| Route | Method | Access / behavior |
| --- | --- | --- |
| `/applications/:applicationId/generated-documents` | `POST` | Active `OFFICER` or `ADMIN` only; requires `DEMO_DOCUMENT_ISSUER_ENABLED=true` and an externally approved application. This is a demo issuance bridge, not an approval route. |
| `/applications/:applicationId/generated-documents` | `GET` | Citizen lists only their own generated documents. |
| `/generated-documents/:generatedDocumentId` | `GET` | Citizen gets only their own generated-document metadata. |
| `/generated-documents/:generatedDocumentId/download` | `GET` | Citizen downloads only their own generated document. |
| `/generated-documents/:generatedDocumentId/signing-sessions` | `POST` | Citizen starts an expiring mock signing session for their own unsigned document. |
| `/generated-document-signing-sessions/:sessionId/complete` | `POST` | Citizen completes mock signing with `signingChallenge`, `consentAccepted: true`, and the required `consentVersion`. Repeated completion is idempotent. |

Signing validates document integrity, challenge expiry, and ownership. Once all required demo documents are signed, the application moves to `SIGNED` inside the protected transaction. The citizen completion endpoint then moves it to `COMPLETED`, also idempotently.

## Errors and security

- Zod validates request bodies, parameters, and query values before service logic.
- Unknown resources return `404`; ownership failures do not reveal another citizen's data.
- Invalid state changes return `409`; serializable transaction retry exhaustion also returns a retryable `409`.
- Production CORS requires explicit origins; wildcard `CORS_ORIGIN=*` is rejected.
- Upload handling enforces supported types and size limits, uses UUID storage names, and does not accept client-controlled storage paths.

## Configuration and migrations

Copy `.env.example` to `.env`. Set `DATABASE_URL`, a 32+ character `JWT_SECRET`, explicit `CORS_ORIGIN` values, and (only for the demo bridge) `DEMO_DOCUMENT_ISSUER_ENABLED=true`.

Review committed migration SQL before applying it to a new database. Do not use `prisma db push`, reset shared databases, edit historical migrations, or reapply the Batch 6 generated-document migration. Batch 7 and Batch 8 introduce no migration.

## Prototype limitation and dependency risk

There are no real Aadhaar, PAN, biometric, e-KYC, e-sign, or issuance integrations. This API is suitable for demonstration and hackathon scenarios only.

The current dependency lockfile has known high-severity `npm audit --omit=dev` findings, including existing Express, Multer, and Prisma-tooling advisories. Resolving dependencies is outside Batch 8 and requires a separately reviewed update.
