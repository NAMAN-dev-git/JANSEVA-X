# JANSEVA-X Citizen Backend

JANSEVA-X Citizen Backend is a TypeScript, Express, and Prisma prototype for citizen-owned government-service applications. It is a demonstration system, not a government service.

## Prototype boundary

All Aadhaar, PAN, face, fingerprint, e-KYC, document-issuance, and e-sign integrations are deterministic **MOCK / DEMO** implementations. The backend does not contact UIDAI, PAN/CBDT, biometric hardware, e-KYC, e-sign, DigiLocker, or government systems. Generated completion certificates are marked **DEMO / PROTOTYPE** and have no legal validity.

This backend does not implement complaints, RTI, benefits, payments, analytics, employee workflows, or a citizen-facing officer approval API.

## Citizen lifecycle

The supported prototype lifecycle is:

`DRAFT` -> upload/analyze documents -> mock identity verification -> `IDENTITY_VERIFIED` -> citizen submission -> `SUBMITTED` -> external/officer review boundary -> `APPROVED` -> demo certificate issuance -> mock e-sign -> `SIGNED` -> citizen acknowledgement -> `COMPLETED`

- Documents can be uploaded, deleted, or analyzed only while an application is `DRAFT`.
- Identity verification is performed against a citizen-owned `DRAFT` application and transitions it to `IDENTITY_VERIFIED` when all required mock checks pass.
- A citizen can submit only an `IDENTITY_VERIFIED` application.
- `APPROVED` is an external/officer-owned boundary. This citizen backend intentionally has no public approval route.
- Demo certificate issuance requires an active officer or admin account and `DEMO_DOCUMENT_ISSUER_ENABLED=true`.

## Security controls

- JWT authentication, role checks, active-account checks, and citizen ownership isolation on protected citizen routes.
- Password hashing, refresh-token hashing, and JWT secret validation.
- Helmet, rate limiting, explicit production CORS origins, request-size limits, and centralized API errors.
- UUID-based stored filenames, file-type/size validation, and path-safe download handling.
- Bounded OCR output; Aadhaar and PAN numbers are masked in persisted document-analysis metadata.
- Generated-document integrity hashes, expiring signing challenges, consent capture, transaction retries, and idempotent signing/completion behavior.

## Setup

Prerequisites: Node.js 20+ and PostgreSQL 14+.

1. Copy `.env.example` to `.env` and set a strong `JWT_SECRET` and a valid `DATABASE_URL`.
2. Install the lockfile-pinned dependencies: `npm ci`.
3. Generate Prisma Client: `npm run prisma:generate`.
4. Review every existing migration SQL file before applying it to a new local database, then run `npm run prisma:migrate`.
5. Optionally seed a disposable local database with `npm run prisma:seed`.
6. Start development: `npm run dev`.

Do not use `prisma db push`, reset a shared database, or edit/reapply historical migrations. The `prisma:migrate` script creates development migrations; deployment environments must use reviewed, already-committed migrations via `prisma migrate deploy`.

## Environment

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string. |
| `JWT_SECRET` | Required secret, at least 32 characters. |
| `JWT_EXPIRES_IN` | Access-token lifetime. |
| `CORS_ORIGIN` | Comma-separated allowed origins. `*` is rejected when `NODE_ENV=production`. |
| `UPLOAD_DIR` | Local prototype storage directory for uploaded files. |
| `MAX_FILE_SIZE_MB` | Upload-size limit. |
| `DEMO_DOCUMENT_ISSUER_ENABLED` | Enables the officer/admin demo certificate-issuance bridge only. |

## API overview

Public routes expose service catalog data and authentication (`/api/auth/register`, `/login`, `/refresh`, `/logout`, `/me`). Citizen application routes are under `/api/applications`; document routes are nested beneath their owning application; identity routes are under `/api/verification`; and generated-document routes are under `/api/applications/:applicationId/generated-documents`.

See [API_DOCUMENTATION.md](API_DOCUMENTATION.md) for request contracts, ownership rules, lifecycle behavior, and demo limitations.

## Migrations and prototype data

The repository contains the reviewed schema history, including the Batch 6 generated-document migration. Batch 7 and Batch 8 require no additional migration. Keep migration history immutable after it has been reviewed or applied.

Local seeds and mock providers are demonstration data only; they must not be treated as production integrations or records.

## Known dependency risk

`npm audit --omit=dev` currently reports high-severity advisories in the existing dependency tree (including Express, Multer, and Prisma tooling). Dependency updates are deliberately outside this batch and should be separately reviewed, tested, and scheduled before a real production deployment.
