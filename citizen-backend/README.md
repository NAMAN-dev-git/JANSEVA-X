# JANSEVA-X Citizen Backend

JANSEVA-X is a prototype government document-services platform. Batch 5 adds a citizen-side identity-verification demonstration using deterministic mock providers and a QR pairing flow; it preserves the Batch 1–4 document workflow.

## Implemented scope

- Shared Prisma/PostgreSQL schema for the future Citizen and Employee Backends.
- Citizen registration, login, refresh-token rotation, logout, and authenticated identity lookup.
- Authenticated citizen profile read and self-service update.
- Public active-service and service-requirement catalogue APIs.
- Citizen-owned draft creation, listing, details, data update, status history, and `DRAFT` to `SUBMITTED` submission.
- Citizen-owned PDF/JPG/JPEG/PNG uploads (10 MB maximum), SHA-256 metadata, safe local storage, OCR, structured extraction, explainable mismatch detection, and persisted prototype document checks.
- Submitted-application Aadhaar, PAN, face, fingerprint-QR, and e-KYC demo verification APIs, all stored in the existing `Verification` model.
- JWT bearer authentication, hashed password storage, hashed refresh-token storage, Helmet, CORS, rate limiting, Zod validation, request IDs, request logging, and centralized error handling.
- `GET /api/health`.

## Batch 5 identity verification demo

All Batch 5 endpoints require a citizen bearer token and enforce application, verification, and QR-session ownership. Verification mutations are available only for `SUBMITTED` applications (or safe retries after `IDENTITY_VERIFIED`); the owned verification summary is intentionally readable for any application status, including `DRAFT`. Aadhaar, PAN, face, and fingerprint completion move an application to the existing `IDENTITY_VERIFIED` status and write `ApplicationStatusHistory`; e-KYC is an optional synthetic capstone that requires Aadhaar and PAN first.

| Method | Path |
| --- | --- |
| POST | `/api/applications/:applicationId/verifications/aadhaar` |
| POST | `/api/applications/:applicationId/verifications/pan` |
| POST | `/api/applications/:applicationId/verifications/face/start` |
| POST | `/api/verifications/:verificationId/face/complete` |
| POST | `/api/applications/:applicationId/verifications/fingerprint/start` |
| POST | `/api/fingerprint-sessions/:sessionId/pair` |
| POST | `/api/fingerprint-sessions/:sessionId/steps/:step/complete` |
| GET | `/api/fingerprint-sessions/:sessionId/status` |
| POST | `/api/applications/:applicationId/verifications/ekyc` |
| GET | `/api/applications/:applicationId/verifications/summary` |

Fingerprint is a ten-minute QR/browser pairing prototype with this enforced sequence: `RIGHT_INDEX`, `RIGHT_MIDDLE`, `RIGHT_RING`, `RIGHT_PINKY`, `RIGHT_THUMB`. It does not capture, infer, or verify a physical finger. The database stores only the hash of the temporary pairing challenge and completed step labels. An active session cannot be overwritten by a repeated start; expired sessions may be restarted. Pairing and steps are conditional transactional updates, so a step succeeds at most once.

The provider classes (`MockAadhaarProvider`, `MockPanProvider`, `MockFaceVerificationProvider`, `MockFingerprintProvider`, and `MockEkycProvider`) are intentionally deterministic and replaceable. Results always include `DEMO`/`MOCK` labelling. No raw Aadhaar, PAN, face image, embedding, fingerprint, minutiae, OTP secret, real e-KYC document, or government credential is persisted.

**JANSEVA-X does not connect to UIDAI, PAN/CBDT, biometric hardware, an e-KYC provider, e-sign infrastructure, or any government authentication service.**

## Not implemented

Live Aadhaar/PAN/biometric/e-KYC verification, consent, officer review, correction handling, approval/rejection, e-signing, generated documents, and all frontend work remain outside Batch 5. OCR and analysis do not verify document authenticity or government records.

## Setup

1. Install Node.js 20+ and PostgreSQL 14+.
2. Copy `.env.example` to `.env`. Set a valid PostgreSQL `DATABASE_URL` and a unique `JWT_SECRET` of at least 32 characters.
3. Create the database named in `DATABASE_URL`.
4. Install packages, generate Prisma, migrate, and seed:

```bash
npm install
npm run prisma:generate
npm run prisma:migrate -- --name init
npm run prisma:seed
```

For an existing local Batch 1 database, create and apply a new migration after pulling this change. The profile's API field is now `phone` (mapped to the existing `mobile_number` column), while `address` is normalized to text and `city`, `state`, and `pincode` were added.

## Environment

Required configuration is documented in `.env.example`:

- `DATABASE_URL`
- `JWT_SECRET`
- `JWT_EXPIRES_IN`
- `REFRESH_TOKEN_EXPIRES_IN_DAYS`
- `CORS_ORIGIN`
- `PORT`
- `NODE_ENV`

## Commands

```bash
npm run dev
npm run build
npm start
npm test
npm run test:types
npm run prisma:validate
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
```

Batch 5 adds the additive migration `20260912_batch5_identity_verification_demo`; inspect it, then apply it through the normal `npm run prisma:migrate` workflow. Do not use `prisma db push` or `prisma migrate reset`.

## API overview

| Method | Path | Authentication |
| --- | --- | --- |
| GET | `/api/health` | None |
| POST | `/api/auth/register` | None |
| POST | `/api/auth/login` | None |
| POST | `/api/auth/refresh` | None, refresh token body |
| POST | `/api/auth/logout` | None, refresh token body |
| GET | `/api/auth/me` | Bearer access token |
| GET | `/api/citizen/profile` | Citizen Bearer access token |
| PATCH | `/api/citizen/profile` | Citizen Bearer access token |
| GET | `/api/services` | None |
| GET | `/api/services/:serviceId` | None |
| GET | `/api/services/:serviceId/requirements` | None |
| POST | `/api/applications` | Citizen Bearer access token |
| GET | `/api/applications` | Citizen Bearer access token |
| GET | `/api/applications/:applicationId` | Citizen Bearer access token |
| PATCH | `/api/applications/:applicationId` | Citizen Bearer access token |
| POST | `/api/applications/:applicationId/submit` | Citizen Bearer access token |
| GET | `/api/applications/:applicationId/history` | Citizen Bearer access token |
| POST | `/api/applications/:applicationId/documents` | Citizen Bearer access token |
| GET | `/api/applications/:applicationId/documents` | Citizen Bearer access token |
| GET | `/api/documents/:documentId` | Citizen Bearer access token |
| DELETE | `/api/documents/:documentId` | Citizen Bearer access token |
| POST | `/api/documents/:documentId/analyze` | Citizen Bearer access token |
| GET | `/api/documents/:documentId/verification` | Citizen Bearer access token |

See `API_DOCUMENTATION.md` and `../shared/API_CONTRACT.md` for request and response contracts.

## Current citizen flow

Login -> Browse Government Services -> Select Service -> Create Draft Application -> Update Draft -> Submit Application -> Track Status and History.

Application ownership is derived from the authenticated JWT and is never client-selectable. The only implemented citizen status transition is `DRAFT` to `SUBMITTED`. Submission currently requires only an active service; Batch 4 document analysis does not alter application status or establish identity verification.

## Batch 4 document processing

Upload one multipart field named `file` to an owned application, with optional `expectedDocumentType` (`AADHAAR`, `PAN`, `TRADE_LICENCE`, `INCOME_CERTIFICATE`, `DOMICILE_CERTIFICATE`, `BIRTH_CERTIFICATE`, `PROPERTY_DOCUMENT`, `OTHER`, or `UNKNOWN`) and an optional service `requirementId`. Only PDF, JPG/JPEG, and PNG are accepted, with matching MIME type, extension, and file signature, and a 10 MB ceiling. Image pixel count, PDF page count, OCR concurrency, OCR text size, and OCR processing time are bounded. Original filenames never form storage paths; generated UUID filenames are stored under `UPLOAD_DIR`, and the API never exposes storage paths.

`Tesseract.js` performs image OCR. `pdf-parse` extracts embedded PDF text; scanned PDFs without an embedded text layer require a future PDF-to-image renderer before Tesseract can read them. The default analysis is deterministic and local—there is no LLM/API-key dependency. It recognizes only supported evidence, returns `null` for uncertain fields, validates the structured result with Zod, and labels all results `DEMO/PROTOTYPE`. It is not authentication, legal signature/seal inspection, or government-document authenticity verification.

Tesseract may download its English language data on the first image analysis unless it is pre-provisioned in the deployment environment. Production deployments should provide controlled outbound access or bundle that language data; no external LLM key is needed.

## Batch 4 migration

`prisma/migrations/20260910_batch4_document_hardening/migration.sql` is additive and must be reviewed before deployment. It adds the `DOCUMENT` verification type, `documents.sha256`, `documents.expected_document_type`, and document/type verification uniqueness. It intentionally stops rather than inventing hashes if legacy document rows lack source-derived SHA-256 values.

## Demo data

The seed creates synthetic prototype accounts and service data.

**DEMO ONLY - NOT REAL GOVERNMENT ACCOUNTS**

- Citizen: `demo.citizen@jansevax.test`
- Officer: `demo.officer@jansevax.test`
- Password: `DemoPassword123!`

The demo accounts contain no real identity, Aadhaar, PAN, or biometric data. They exist only after a successful local migration and seed.

## Prototype boundary

This backend has no live UIDAI, PAN, biometric, e-KYC, government API, or legally valid e-sign integration. Authentication is prototype application authentication only.
