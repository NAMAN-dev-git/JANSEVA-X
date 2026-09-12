# JANSEVA-X Citizen Backend API Documentation

This document describes the implemented Citizen Backend surface through Batch 5.

## Response convention

Successful resource responses use `{ "success": true, "data": ... }`. Error responses use `{ "success": false, "error": { "code": "...", "message": "..." }, "requestId": "..." }`. Password hashes and stored refresh-token hashes are never returned.

## Authentication

### `POST /api/auth/register`

Creates a `CITIZEN` user and profile. The body requires `email`, `password`, and `fullName`; it may include `phone`, `dateOfBirth` (`YYYY-MM-DD`), `address`, `city`, `state`, and `pincode`.

Passwords must be 12-128 characters and contain uppercase, lowercase, numeric, and special characters. A successful `201` response contains a public user object and an access/refresh token pair. Duplicate email returns `409`; malformed input returns `400`.

### `POST /api/auth/login`

Requires `{ "email": "...", "password": "..." }`. A successful response contains a public user object and a new access/refresh token pair. Incorrect or nonexistent credentials return the same `401` response. Inactive users return `403`.

### `POST /api/auth/refresh`

Requires `{ "refreshToken": "..." }`. The supplied opaque token is matched against a server-side SHA-256 hash, checked for expiry, revocation, and active user status, then revoked and replaced. A successful response contains a new token pair. Invalid, expired, or revoked tokens return `401`.

### `POST /api/auth/logout`

Requires `{ "refreshToken": "..." }` and returns `204`. A matching active refresh token is revoked. This does not invalidate a previously issued stateless access token before its configured expiry.

### `GET /api/auth/me`

Requires `Authorization: Bearer <accessToken>`. Returns the authenticated public user and citizen profile, if present. Missing, invalid, or expired access tokens return `401`.

## Citizen profile

### `GET /api/citizen/profile`

Requires a `CITIZEN` bearer access token. Returns only the authenticated user's profile.

### `PATCH /api/citizen/profile`

Requires a `CITIZEN` bearer access token and at least one editable field: `fullName`, `dateOfBirth`, `phone`, `address`, `city`, `state`, or `pincode`. The route does not accept `userId`, `citizenId`, role, password, status, or timestamp fields, so it cannot select or modify another citizen's profile.

## Government services

The service catalogue is seeded `DEMO/PROTOTYPE` configuration and is not legally authoritative government guidance. These read-only routes expose active services only; citizens cannot create or modify service definitions.

### `GET /api/services`

No authentication required. Returns active services with `serviceId`, name, slug, description, active/prototype flags, and no internal database fields.

### `GET /api/services/:serviceId`

No authentication required. Returns one active service and its ordered requirements. Missing or inactive services return `404`.

### `GET /api/services/:serviceId/requirements`

No authentication required. Returns ordered requirement records with `requirementId`, `serviceId`, name, description, required flag, and sort order. Missing or inactive services return `404`.

## Applications

Every route in this section requires `Authorization: Bearer <accessToken>` for a `CITIZEN` user. The backend derives ownership from the access token's `userId` and never accepts client-supplied `userId`, `citizenId`, or owner fields. Applications outside the authenticated citizen's ownership scope return `404`.

### `POST /api/applications`

Requires `{ "serviceId": "uuid" }`; an optional non-empty JSON object is accepted as `applicationData`. The service must be active. The backend creates a new application in `DRAFT`, assigns its generated `applicationId`, and records the initial `DRAFT` history entry. The current API has no idempotency key support, so callers should avoid retrying a create request after an unknown network outcome.

### `GET /api/applications`

Returns only the authenticated citizen's applications. Optional query parameters are `page` (default `1`), `limit` (default `10`, maximum `50`), exact `status`, and `serviceId`. Each item contains its `applicationId`, service summary, current status, timestamps, and latest status timestamp.

### `GET /api/applications/:applicationId`

Returns the owned application's service, ordered service requirements, current status, controlled `applicationData`, chronological status history, timestamps, and document metadata when document records exist. Batch 3 has no upload endpoint.

### `PATCH /api/applications/:applicationId`

Requires `{ "applicationData": { ... } }`. Only the owned application's data object may be replaced, and only while the application is `DRAFT`. Requests cannot change service, owner, status, officer assignment, timestamps, verification state, or generated-document fields.

### `POST /api/applications/:applicationId/submit`

Requires an empty request body. The owned application must be `DRAFT` and its service must remain active. Batch 3's minimum prototype requirement is a valid active service; document, identity, consent, and verification checks are intentionally not implemented. The only implemented citizen transition is `DRAFT` to `SUBMITTED`; submission sets `submittedAt` and records history.

### `GET /api/applications/:applicationId/history`

Returns chronological history for the owned application. It uses only shared `ApplicationStatus` values. Batch 3 creates only `DRAFT` and `SUBMITTED` history entries.

## Batch 4 documents and prototype analysis

All Batch 4 document endpoints require a `CITIZEN` bearer token. A document is accessible only through an application owned by that citizen; cross-citizen documents return `404`.

### `POST /api/applications/:applicationId/documents`

Multipart upload using a single `file` field. Optional text fields are `expectedDocumentType` (`AADHAAR`, `PAN`, `TRADE_LICENCE`, `INCOME_CERTIFICATE`, `DOMICILE_CERTIFICATE`, `BIRTH_CERTIFICATE`, `PROPERTY_DOCUMENT`, `OTHER`, or `UNKNOWN`) and a service-owned `requirementId`. Only PDF, JPG/JPEG, and PNG with matching MIME type, extension, and file signature are accepted; the maximum is 10 MB. The response returns safe metadata including a SHA-256 digest, never a filesystem path.

### `GET /api/applications/:applicationId/documents`, `GET /api/documents/:documentId`, and `DELETE /api/documents/:documentId`

List, retrieve metadata for, or delete an owned document. `DELETE` returns `204` and removes the controlled local file and database record. No download or arbitrary file-path endpoint is exposed.

### `POST /api/documents/:documentId/analyze`

Reads the owned stored file, runs OCR, detects a probable document type, performs deterministic extraction and application/requirement comparison, validates the exact analysis JSON with Zod, and stores it in the existing `Document.aiExtractionResult` and `Verification` record. `Document.documentType` is the detected type; `expectedDocumentType` is retained separately as untrusted caller context. Every Batch 4 analysis remains `PENDING_VERIFICATION` / `MANUAL_REVIEW`, including a clean consistency result. This is a `DEMO/PROTOTYPE` automated analysis—not an authenticity, signature, seal, identity, Aadhaar, PAN, or government verification result.

The response analysis is exactly: `documentType`, numeric `confidence`, nullable `fields` (`fullName`, `dateOfBirth`, `address`, `documentNumber`, `businessName`, `phone`, `issueDate`, `expiryDate`), `missingFields`, `detectedIssues`, `signatureDetected`, `sealDetected`, `isReadable`, and `recommendation`. Signature and seal values are currently `NOT_AVAILABLE`.

### `GET /api/documents/:documentId/verification`

Returns the persisted structured prototype analysis or `analysis: null` when no analysis has been run.

Image OCR uses Tesseract.js. PDF processing extracts embedded text using `pdf-parse`; scanned PDFs without embedded text cannot yet be rasterized for OCR. No external LLM is required or configured: deterministic local heuristics are the active fallback and never invent unknown values.

## Batch 5 identity-verification demo

All endpoints below require a `CITIZEN` bearer token. Verification mutations require an owned `SUBMITTED` application; safe retries after `IDENTITY_VERIFIED` are supported. `GET` summary is read-only and available for an owned application in any status, including `DRAFT`. All results are explicitly `DEMO`/`MOCK`: JANSEVA-X does not contact UIDAI, PAN/CBDT, biometric hardware, e-KYC, e-sign, DigiLocker, or government systems.

### Aadhaar and PAN

`POST /api/applications/:applicationId/verifications/aadhaar` accepts `{ "aadhaar": "XXXX-XXXX-1234" }` or a demo 12-digit value and returns only `XXXX-XXXX-1234` style data and a demo reference. `POST /api/applications/:applicationId/verifications/pan` accepts a demo PAN or masked PAN, returns a masked PAN plus synthetic taxpayer data, and never stores the raw submitted value.

### Face and e-KYC

`POST /api/applications/:applicationId/verifications/face/start` starts a temporary demo session; `POST /api/verifications/:verificationId/face/complete` returns simulated match/liveness/confidence metadata. Neither endpoint accepts or stores an image, embedding, or biometric template.

`POST /api/applications/:applicationId/verifications/ekyc` requires completed application-level Aadhaar and PAN demo records and returns synthetic references only.

### Fingerprint QR prototype

`POST /api/applications/:applicationId/verifications/fingerprint/start` returns a ten-minute QR-safe pairing payload and the session ID. A repeated start cannot overwrite an active session; it returns `409`. Pair with `POST /api/fingerprint-sessions/:sessionId/pair` using the one-time challenge. Repeated pairing is rejected.

Complete each empty-body step at `POST /api/fingerprint-sessions/:sessionId/steps/:step/complete`, strictly in this order: `RIGHT_INDEX`, `RIGHT_MIDDLE`, `RIGHT_RING`, `RIGHT_PINKY`, `RIGHT_THUMB`. A conditional update makes each step successful at most once. `GET /api/fingerprint-sessions/:sessionId/status` returns only safe state, completed/remaining steps, expiry, and demo verification result.

The pairing challenge is stored only as a SHA-256 hash. Session creation, pairing, each completed step, completion, restart, and expiry are stored as immutable safe audit events. This is a QR/browser sequence demonstration, not real fingerprint capture or verification.

### Summary and status

`GET /api/applications/:applicationId/verifications/summary` aggregates only application-level (`documentId: null`) Aadhaar, PAN, face, fingerprint, and e-KYC records. Document-linked records cannot affect the identity result. When Aadhaar, PAN, face, and fingerprint are all verified, the backend transitions only from `SUBMITTED` to `IDENTITY_VERIFIED` and records status history; it never approves or rejects an application.

## Health check

### `GET /api/health`

Confirms that the HTTP process is running. It does not establish or test a PostgreSQL connection.
