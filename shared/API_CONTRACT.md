# JANSEVA-X Shared API and Data Contract

## Architecture

JANSEVA-X uses one shared PostgreSQL database. The future Citizen Backend and Employee Backend must connect to the same database schema and preserve the contracts in this document. Neither backend owns a separate employee or citizen database.

```
Citizen Frontend → Citizen Backend → Shared PostgreSQL ← Employee Backend ← Employee Frontend
```

Batch 4 extends the Citizen Backend with citizen document upload, OCR, deterministic analysis, and prototype document checks. This contract records shared decisions for both future backends.

## Shared identifiers

All primary identifiers are UUID strings. API payloads and database relations use these names consistently:

| Identifier | Meaning |
| --- | --- |
| `userId` | `User.id` |
| `citizenId` | `CitizenProfile.id` |
| `applicationId` | `Application.id` |
| `serviceId` | `GovernmentService.id` |
| `documentId` | `Document.id` |
| `verificationId` | `Verification.id` |
| `consentId` | `Consent.id` |
| `officerId` | `Officer.id` |
| `generatedDocumentId` | `GeneratedDocument.id` |

## Fixed application statuses

These are the complete and exact `ApplicationStatus` values. Backends and clients must not introduce alternative status names.

```
DRAFT
SUBMITTED
IDENTITY_VERIFIED
DOCUMENTS_VERIFIED
UNDER_REVIEW
CORRECTION_REQUIRED
APPROVED
REJECTED
SIGNED
COMPLETED
```

In particular, `DOCUMENTS_REQUIRED` and `CANCELLED` are not valid application statuses.

## Shared entities

| Entity | Shared responsibility |
| --- | --- |
| `User` | Account identity, role, password hash, and common ownership links. |
| `CitizenProfile` | Citizen-specific profile and application ownership. |
| `Officer` | Employee profile, department, designation, identifier, and assignments. |
| `GovernmentService` / `ServiceRequirement` | Prototype service catalogue and requested documents. |
| `Application` | Citizen request, lifecycle status, form data, and officer review assignment. |
| `Document` / `ApplicationDocument` | Stored upload metadata and its application link. |
| `Verification` | Future simulated Aadhaar, PAN, face, fingerprint, and e-KYC records. |
| `Consent` | Versioned consent text, state, citizen/user/application links, and optional device metadata. |
| `AIConversation` / `AIMessage` | Future assistant, document-checking context, and conversation history. |
| `ApplicationStatusHistory` | Immutable lifecycle transition history. |
| `GeneratedDocument` | Future completed file and e-sign simulation metadata. |
| `Notification` | User-facing application and system notifications. |
| `RefreshToken` | Server-side hash, expiry, and revocation state for opaque rotating refresh tokens. |

## Roles and ownership

`User.role` supports exactly the shared roles `CITIZEN`, `OFFICER`, and `ADMIN`. A citizen profile and officer profile are separate one-to-one extensions of `User`. Employee features must assign and review the existing `Application` records through `assignedOfficerId`; they must not duplicate application data in a separate employee schema.

## API conventions

- Use lowercase plural resources when endpoints are introduced, for example `/api/applications` and `/api/documents`.
- Use camelCase JSON field names, including the shared identifiers above.
- Use UUID strings in URLs and payload identifiers.
- Successful responses use `{ "success": true, "data": ... }` unless an endpoint has a documented alternative such as Batch 1 health.
- Error responses use `{ "success": false, "error": { "code": "...", "message": "..." }, "requestId": "..." }`.
- Time values are ISO 8601 UTC strings in APIs and `DateTime` values in the database.
- Both backends must enforce authorization at their HTTP boundary while respecting this shared data model.

## Implemented authentication and profile endpoints

| Method | Path | Authentication | Request | Success response |
| --- | --- | --- | --- | --- |
| POST | `/api/auth/register` | None | `email`, `password`, `fullName`; optional profile fields | `201` public user and token pair |
| POST | `/api/auth/login` | None | `email`, `password` | public user and token pair |
| POST | `/api/auth/refresh` | None | `refreshToken` | rotated token pair |
| POST | `/api/auth/logout` | None | `refreshToken` | `204 No Content` |
| GET | `/api/auth/me` | Bearer access token | None | authenticated public user and profile |
| GET | `/api/citizen/profile` | Citizen Bearer access token | None | authenticated citizen profile |
| PATCH | `/api/citizen/profile` | Citizen Bearer access token | one or more editable profile fields | updated authenticated citizen profile |

Registration accepts `email`, a 12+ character complex `password`, and `fullName`; optional profile fields are `phone`, `dateOfBirth` (`YYYY-MM-DD`), `address`, `city`, `state`, and `pincode`. Profile patches accept only those profile fields and never a client-selected `userId` or `citizenId`.

Access tokens contain only `userId` and `role` claims. Refresh tokens are opaque random values returned only at issue time; PostgreSQL stores only their SHA-256 hashes. Refresh requests rotate tokens, and logout revokes a matching active refresh token. Logout cannot invalidate an already-issued stateless access token before expiry.

Malformed requests return `400`; duplicate registration returns `409`; missing, invalid, expired, or revoked credentials return `401`; inactive login returns `403`. Password hashes and refresh-token hashes never appear in API responses.

## Implemented service catalogue and application endpoints

| Method | Path | Authentication | Request | Success response |
| --- | --- | --- | --- | --- |
| GET | `/api/services` | None | None | active prototype service summaries |
| GET | `/api/services/:serviceId` | None | UUID path parameter | active service and requirements |
| GET | `/api/services/:serviceId/requirements` | None | UUID path parameter | ordered prototype requirements |
| POST | `/api/applications` | Citizen Bearer access token | `serviceId`, optional `applicationData` | new `DRAFT` application |
| GET | `/api/applications` | Citizen Bearer access token | optional `page`, `limit`, `status`, `serviceId` query | owned paginated application list |
| GET | `/api/applications/:applicationId` | Citizen Bearer access token | UUID path parameter | owned application details |
| PATCH | `/api/applications/:applicationId` | Citizen Bearer access token | controlled `applicationData` object | updated owned draft |
| POST | `/api/applications/:applicationId/submit` | Citizen Bearer access token | empty body | owned submitted application summary |
| GET | `/api/applications/:applicationId/history` | Citizen Bearer access token | UUID path parameter | owned chronological status history |

The catalogue exposes only active seeded `DEMO/PROTOTYPE` services. Service requirements are prototype configuration, not legally authoritative government requirements. Services are read-only to citizens.

Application ownership is always derived from the bearer token's `userId`, resolved to the citizen profile. Client-supplied `userId`, `citizenId`, owner identifiers, status, service replacement, officer fields, and timestamps are rejected or ignored because the accepted request schemas do not expose them. An application outside the caller's ownership scope returns `404`.

`applicationData` is a controlled, non-empty JSON object for future generic form filling. Batch 3 creates an initial `DRAFT` history entry. The only citizen transition currently permitted is `DRAFT` to `SUBMITTED`; it records `submittedAt` and a `SUBMITTED` history entry. All other shared statuses remain reserved for future verification and employee workflows. No documents, identity checks, verification, consent, or real government submission is required or performed in this batch.

The create endpoint does not yet accept an idempotency key; clients should avoid retrying a create request after an unknown network outcome.

## Batch 5 identity-verification demo contract

Batch 5 activates the existing `Verification` types `AADHAAR`, `PAN`, `FACE`, `FINGERPRINT`, and `E_KYC`; it does not create a duplicate verification entity. All endpoints require a `CITIZEN` bearer token, scope ownership through the authenticated citizen profile, and return `404` for records outside that scope.

| Method | Path | Request / behaviour |
| --- | --- | --- |
| POST | `/api/applications/:applicationId/verifications/aadhaar` | `{ "aadhaar": "XXXX-XXXX-1234" }` or demo 12 digits; returns a masked result and `DEMO-AADHAAR-*` reference. |
| POST | `/api/applications/:applicationId/verifications/pan` | `{ "pan": "ABCDE1234F" }` or masked demo value; returns `ABCDE****F`, synthetic taxpayer data, and `DEMO-PAN-*`. |
| POST | `/api/applications/:applicationId/verifications/face/start` | Empty body; creates/reuses a demo face session. |
| POST | `/api/verifications/:verificationId/face/complete` | Empty body; produces simulated match/liveness/confidence metadata only. |
| POST | `/api/applications/:applicationId/verifications/fingerprint/start` | Empty body; returns QR-safe pairing payload, expiry, and required steps. A second start while active returns `409`; an expired session may be restarted. |
| POST | `/api/fingerprint-sessions/:sessionId/pair` | `{ "pairingChallenge": "uuid" }`; validates the hashed challenge. |
| POST | `/api/fingerprint-sessions/:sessionId/steps/:step/complete` | Empty body; only `RIGHT_INDEX → RIGHT_MIDDLE → RIGHT_RING → RIGHT_PINKY → RIGHT_THUMB` is valid. |
| GET | `/api/fingerprint-sessions/:sessionId/status` | Current pairing/state/steps/expiry and safe final demo result. |
| POST | `/api/applications/:applicationId/verifications/ekyc` | Empty body; requires verified Aadhaar and PAN and creates synthetic e-KYC references. |
| GET | `/api/applications/:applicationId/verifications/summary` | Safe aggregate Aadhaar/PAN/face/fingerprint/e-KYC state. |

Identity mutations require `SUBMITTED`; status-safe retries after `IDENTITY_VERIFIED` are permitted. The owned summary endpoint is intentionally read-only and available for every application status, including `DRAFT`. When the four core demo records (Aadhaar, PAN, face, fingerprint) are verified, the backend advances only to the existing `IDENTITY_VERIFIED` status and records `ApplicationStatusHistory`. It never approves or rejects an application. e-KYC is an optional synthetic capstone, not a real identity credential.

`FingerprintSession` and its immutable `FingerprintSessionEvent` trail are the Batch 5 schema additions. They store a SHA-256 pairing-challenge hash, safe provider reference, expiry, event type, and step enum values. They do not store fingerprint images, templates, minutiae, physical-finger claims, face images/embeddings, unmasked Aadhaar/PAN, OTPs, raw challenges, or real tokens.

**JANSEVA-X does not connect to real UIDAI, PAN/CBDT, biometric hardware, e-KYC, e-sign, DigiLocker, or government authentication infrastructure. All provider output is deterministic `DEMO`/`MOCK` output.**

## Prototype verification boundary

`AADHAAR`, `PAN`, `FACE`, `FINGERPRINT`, and `E_KYC` are future prototype verification types only. They do not represent live UIDAI integration, real PAN API access, government biometric-gateway access, legally valid e-signing, or a real e-KYC provider. Seed data contains synthetic demo identities only.

## Batch 4 document contract

Batch 4 adds the `DOCUMENT` verification type. It is a prototype automated document-consistency check and is not an Aadhaar/PAN/identity/biometric/government authenticity verification. The existing `DocumentStatus` values are used: new uploads are `UPLOADED`; every automated analysis remains `PENDING_VERIFICATION` and `MANUAL_REVIEW` until a future authorized workflow acts on it. No new document or verification status system is introduced.

`Document` now stores a 64-character SHA-256 digest (`sha256`) and optional untrusted caller context (`expectedDocumentType`) in addition to its generated `storageKey`, original filename, MIME type, size, status, and structured extraction field. `documentType` is set only to a detected type after analysis. Files are associated through the existing `ApplicationDocument` link and can only be accessed through the owning application/citizen boundary.

| Method | Path | Authentication | Success response |
| --- | --- | --- | --- |
| POST | `/api/applications/:applicationId/documents` | Citizen bearer token | `201` safe document metadata |
| GET | `/api/applications/:applicationId/documents` | Citizen bearer token | owned document metadata list |
| GET | `/api/documents/:documentId` | Citizen bearer token | owned document metadata |
| DELETE | `/api/documents/:documentId` | Citizen bearer token | `204 No Content` |
| POST | `/api/documents/:documentId/analyze` | Citizen bearer token | strict prototype analysis JSON |
| GET | `/api/documents/:documentId/verification` | Citizen bearer token | stored strict analysis or `null` |

Upload accepts one multipart `file` only: PDF, JPG/JPEG, or PNG, with matching MIME type/extension and a 10 MB maximum. Implementations must generate storage names and must not expose storage paths. Analysis results retain only confidently extracted values; unreliable values are `null`. The current local deterministic analyzer reports signature/seal detection as `NOT_AVAILABLE`; it makes no legal or authenticity claims. OCR uses Tesseract.js for images and embedded PDF-text extraction where present. Scanned-PDF rasterization and any external LLM provider are deliberately outside this batch.
