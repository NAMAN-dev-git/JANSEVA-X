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

## Employee Backend API (Batch 1)

The Employee Backend uses the existing shared database records and JWT claims (`userId`, `role`). It does not duplicate the `User`, `Officer`, `Application`, `Document`, or history models. Protected Employee Backend routes require `OFFICER` or `ADMIN`; a `CITIZEN` token is rejected. `OFFICER` access is limited to assigned applications, except for claiming an unassigned submitted application. `ADMIN` may access the full queue and assign or release applications.

| Method | Path | Authorization | Request | Success response |
| --- | --- | --- | --- | --- |
| GET | `/api/health` | None | None | Employee service health response |
| GET | `/api/employee/me` | OFFICER or ADMIN bearer | None | Safe user and officer profile |
| GET | `/api/employee/applications` | OFFICER or ADMIN bearer | `page`, `limit`; optional `status`, `reviewStatus`, `serviceId` | Authorized paginated work queue |
| GET | `/api/employee/applications/:applicationId` | Assigned OFFICER or ADMIN bearer | None | Safe review detail, document metadata, and history |
| GET | `/api/employee/applications/:applicationId/history` | Assigned OFFICER or ADMIN bearer | None | Authorized chronological history |
| POST | `/api/employee/applications/:applicationId/claim` | OFFICER bearer | Empty body | Atomically claimed application |
| POST | `/api/employee/applications/:applicationId/release` | Assigned OFFICER or ADMIN bearer | Empty body | Released application summary |
| PATCH | `/api/employee/applications/:applicationId/assignment` | ADMIN bearer | `officerId` UUID or `null` | Assigned or released application |
| POST | `/api/employee/applications/:applicationId/review/start` | Assigned OFFICER or ADMIN bearer | Empty body | Application moved into review |
| POST | `/api/employee/applications/:applicationId/decision` | Assigned OFFICER or ADMIN bearer | `status`, `note` | Backend-confirmed decision |
| PATCH | `/api/employee/documents/:documentId/review` | Assigned OFFICER or ADMIN bearer | `action`, `note` | Safe document and verification metadata |

Only these application transitions are permitted: `SUBMITTED -> UNDER_REVIEW`; `UNDER_REVIEW -> CORRECTION_REQUIRED | APPROVED | REJECTED`; `APPROVED -> SIGNED`; and `SIGNED -> COMPLETED`. Employee decisions require a bounded human note. AI/OCR/document analysis remains advisory and never independently approves or rejects an application.

Claims use a conditional update to prevent concurrent claims. Assignment, release, review-start, and decision operations use transactions for related writes and append `ApplicationStatusHistory` with the acting user where applicable. Invalid state/assignment conflicts return `409`; invalid bodies `400`; authentication/authorization failures `401`/`403`; inaccessible records `404`.

Employee responses use `{ "success": true, "data": ... }` and exclude password hashes, refresh-token hashes, document storage keys, document bytes, raw OCR text, and unnecessary citizen profile fields. Document review returns safe metadata and verification state only.

## Employee Backend API (Batch 2)

Batch 2 adds role-scoped Employee dashboard and application-registry reads. It uses the existing `Application`, `Officer`, `ApplicationStatus`, `OfficerReviewStatus`, and `ApplicationStatusHistory` records; no database schema or migration change is required.

| Method | Path | Authorization | Request | Success response |
| --- | --- | --- | --- | --- |
| GET | `/api/employee/dashboard` | OFFICER or ADMIN bearer | None | Authorized counts and up to five recent application previews |
| GET | `/api/employee/applications` | OFFICER or ADMIN bearer | Existing pagination/status/review/service filters; optional registry filters below | Authorized paginated registry |
| GET | `/api/employee/applications/completed` | OFFICER or ADMIN bearer | `page`, `limit`; optional `serviceId`, `search`, `sortBy`, `sortOrder` | Authorized paginated `COMPLETED` registry |

Dashboard responses contain the authenticated role and `counts`: total visible applications, the number of claimable unassigned submitted applications, zero-filled counts for every fixed `ApplicationStatus`, and zero-filled counts for every fixed `OfficerReviewStatus`. `recentApplications` contains at most five safe registry previews ordered by latest update. Counts and previews obey the same Employee visibility boundary as the registry.

The application registry keeps `page` (default `1`) and `limit` (default `10`, maximum `50`) plus its Batch 1 exact `status`, `reviewStatus`, and `serviceId` filters. Batch 2 additionally accepts a bounded `search` term for application number or authorized citizen full name; `assignedOfficerId` as an officer UUID or literal `unassigned`; inclusive ISO-8601 UTC `submittedFrom` and `submittedTo` values; and `sortBy` (`submittedAt`, `createdAt`, or `updatedAt`) with `sortOrder` (`asc` or `desc`). The submitted range must be chronologically ordered. An OFFICER may filter only their own assignment or `unassigned`; ADMIN may filter any officer assignment. Registry previews include only minimal citizen context (`citizenId`, `fullName`, `city`, and `state`) alongside safe application, service, assignment, and timestamp fields.

The completed endpoint fixes its status server-side to the existing `COMPLETED` value and does not accept a client-selected status. It supports bounded pagination, optional service/search filters, and `createdAt` or `updatedAt` ordering. Each completed item includes a nullable `completedAt` derived from the immutable `COMPLETED` status-history entry; it does not add a new database field.

## Employee Backend API (Batch 3)

Batch 3 adds a detailed Employee review read model and a human identity-verification review action using only existing shared records. No application status transition is performed by identity review, and AI/OCR diagnostics remain advisory.

| Method | Path | Authorization | Request | Success response |
| --- | --- | --- | --- | --- |
| GET | `/api/employee/applications/:applicationId/review` | Assigned OFFICER or ADMIN bearer | UUID path parameter | Safe detailed application-review payload |
| PATCH | `/api/employee/applications/:applicationId/identity-verifications/:verificationId/review` | Assigned OFFICER or ADMIN bearer | `action`, bounded `note` | Safe updated identity-verification summary |

The detailed review payload contains the authorized minimal applicant context, application form data already available to Employee review, current application/review status, correction reason, service and requirements, assignment officer and assignment/review timestamps, safe document metadata and manual-review state, non-document identity-verification summaries, and chronological status history. It excludes password and refresh-token data, storage keys, document bytes, document hashes, provider references, verification result payloads, and raw OCR.

Identity review accepts only `VERIFY`, `REJECT`, or `REQUEST_MANUAL_REVIEW`. It operates only on an existing `AADHAAR`, `PAN`, `FACE`, `FINGERPRINT`, or `E_KYC` verification belonging to the specified application; `DOCUMENT` verifications are excluded. The action updates the existing verification status, failure reason, and verification timestamp as applicable, and appends an audit history entry using the current application status. It does not create verification records, change application status, or independently approve/reject an application.

When persisted document analysis is structurally valid, review responses expose only an allowlisted advisory diagnostic: detected document type, confidence, readability, missing fields, detected issues, signature/seal availability, and recommendation. Extracted fields such as document number, address, phone, and name, along with OCR text and arbitrary stored analysis data, are never returned. Diagnostics are explicitly `DEMO/PROTOTYPE` and require authorized human review; they never determine an application outcome. Malformed or absent analysis produces no diagnostics.
