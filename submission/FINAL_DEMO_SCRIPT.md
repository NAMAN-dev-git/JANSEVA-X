# JANSEVA-X — Final Live Demo Script

**Target duration:** 6–7 minutes
**Prototype boundary:** All records, identity checks, documents, e-signing, and fingerprint samples shown are synthetic demo components. No real government system or biometric provider is contacted.

| Time | Screen | Action | What to say | Expected result |
| --- | --- | --- | --- | --- |
| 0:00–0:30 | Opening slide / Citizen Portal | Introduce JANSEVA-X. | “Government services should understand citizens. JANSEVA-X turns a citizen’s intent into a guided application journey, while keeping the citizen and officer in control.” | Audience understands the end-to-end objective. |
| 0:30–1:00 | Citizen Portal | Open the assistant. | “Instead of asking a citizen to navigate a complex portal first, we start with what they need.” | Citizen portal is ready. |
| 1:00–1:30 | JANSEVA AI | Say or type: **“I need to renew my trade licence.”** | “JANSEVA AI recognizes the supported service and opens the relevant application context automatically.” | Trade Licence application opens. |
| 1:30–2:15 | Preparation | Give consent, then show Smart Fill and Smart Attach. | “Preparation is consent-based. Smart Fill and Smart Attach use only available synthetic demo records to reduce repeated entry and document hunting.” | Preparation steps complete; no claim of real registry access. |
| 2:15–3:10 | Identity Verification | Show mock Aadhaar/PAN/e-KYC, complete face demo, then start fingerprint session. Scan the QR from the phone, log in, press and hold for each of five scanner steps. | “These are deterministic prototype checks. The QR companion restores the same authorized session after login. The scanner shows synthetic verification data; no real fingerprint is captured, stored, or matched.” | Phone completes five-finger demo; PC verification state refreshes. |
| 3:10–3:45 | Review and Submit | Choose **Submit** after verification. | “The citizen still explicitly chooses whether to submit or retain a draft. Submission creates a durable ticket and the application progresses through asynchronous processing.” | Submission ticket/processing state appears. |
| 3:45–4:45 | Employee Portal | Sign in as the demo officer, open queue, claim application, review documents, AI advisory, and identity summary, then start review. | “The employee workflow is structured, but AI remains advisory. The officer owns the final decision.” | Application is claimed and review context is visible. |
| 4:45–5:30 | Officer Review → Citizen document | Approve, issue the generated demo document, then return to Citizen view and complete mock e-sign. | “Approval triggers the existing prototype document pipeline. The citizen gives explicit consent for a mock e-sign; this is not a legally valid signature.” | Generated document, signing, and completion state appear. |
| 5:30–6:15 | Architecture / Security | Show architecture and controls. | “The prototype separates Citizen and Employee portals, uses JWT authentication, active-account checks, role and ownership authorization, validation, lifecycle controls, idempotency, and protected documents.” | Technical credibility and trust boundaries are clear. |
| 6:15–6:45 | Closing | Return to closing slide. | “JANSEVA-X moves government services from portal-centric forms to intent-centric journeys. Tell JANSEVA-X what you need—we’ll help you get it done.” | Clear close and invitation for questions. |

## Presenter notes

- Keep the Citizen and Employee portals in separate browser tabs before starting.
- Use only the seeded **DEMO / SYNTHETIC** accounts documented in the README.
- Use the same LAN for PC and phone during the fingerprint segment; confirm the QR points to the current LAN-reachable frontend before presenting.
- Keep the employee decision human-owned in every explanation. Describe AI as an advisory layer, never an approver.
- Use the Approve path for the main live flow. Mention Request Correction and Reject as available officer decision branches; demonstrate them only on separate synthetic cases if time allows.

## Backup flow

1. If voice recognition is unavailable, type the Trade Licence request into JANSEVA AI.
2. If the phone cannot join the fingerprint demo, explain the QR session architecture using the PC status screen and continue with the remaining workflow; do not claim a phone verification completed.
3. If the application is already processed, begin with a prepared synthetic application at the equivalent stage rather than changing the recorded outcome.
4. If a port is occupied, reuse the healthy service rather than starting a duplicate process.

## Fast troubleshooting

| Symptom | Check |
| --- | --- |
| Phone shows a network error | PC and phone are on the same LAN; frontend/backend use LAN-reachable URLs; companion API base is not `localhost`; CORS/binding are healthy. |
| QR session expired | Start a fresh fingerprint session from the PC; do not reuse an old QR. |
| Browser UI looks stale | Hard refresh. For a production-style PWA retest, clear old site data/service worker only when appropriate. |
| PostgreSQL/backend unavailable | Verify the configured database and backend health before beginning the live flow. |

## What not to say

- Do not claim real Aadhaar, PAN, UIDAI, CBDT, DigiLocker, registry, payment, e-KYC, biometric, fingerprint, face, or e-sign integration.
- Do not claim legal validity, production deployment, processing-time savings, user counts, or accuracy metrics.
- Do not call synthetic scanner hashes “biometric data.” They are visual demo data only.
- Do not say the AI makes a government decision. Final review belongs to the officer.
