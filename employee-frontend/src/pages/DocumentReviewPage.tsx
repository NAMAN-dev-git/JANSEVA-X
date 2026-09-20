import { useEffect, useMemo, useState } from "react";
import { EmployeeHeader } from "../components/EmployeeHeader";
import { ApiError, employeeApi, type ApplicationReview, type DocumentReviewAction } from "../lib/api";
import { useApplicationReview } from "../hooks/useApplicationReview";

interface DocumentReviewPageProps {
  applicationId: string | null;
  onNavigateAiPreVerification: () => void;
  onNavigateApplicationDetails: () => void;
  onNavigateApplications: () => void;
  onNavigateCompleted: () => void;
  onNavigateProfile: () => void;
  onNavigateDashboard: () => void;
  onSessionExpired: () => void;
  onReturnToLogin: () => void;
}

type ReviewRecord = {
  id: string;
  category: "UPLOADED DOCUMENT" | "MOCK ISSUED REFERENCE" | "GENERATED DOCUMENT";
  title: string;
  subtitle: string;
  status: string;
  metadata: Array<{ label: string; value: string }>;
  documentId?: string;
  diagnostics?: ApplicationReview["documents"][number]["diagnostics"];
};

function formatDate(value: string | null): string {
  if (!value) return "Not provided";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function buildRecords(review: ApplicationReview | null): ReviewRecord[] {
  if (!review) return [];

  return [
    ...review.documents.map((document) => ({
      id: `uploaded-${document.documentId}`,
      category: "UPLOADED DOCUMENT" as const,
      title: document.originalFilename,
      subtitle: document.requirement?.name ?? document.label ?? document.expectedDocumentType ?? "Supporting document",
      status: document.review?.status ?? document.status,
      documentId: document.documentId,
      diagnostics: document.diagnostics,
      metadata: [
        { label: "Requirement", value: document.requirement?.name ?? "Not linked to a requirement" },
        { label: "Document type", value: document.documentType || "Not provided" },
        { label: "File metadata", value: `${document.mimeType} · ${document.fileSizeBytes.toLocaleString()} bytes` },
        { label: "Uploaded", value: formatDate(document.uploadedAt) },
      ],
    })),
    ...review.mockIssuedDocumentAttachments.map((attachment) => ({
      id: `mock-${attachment.attachmentId}`,
      category: "MOCK ISSUED REFERENCE" as const,
      title: attachment.mockIssuedDocument.displayName,
      subtitle: attachment.requirementName ?? attachment.mockIssuedDocument.documentType,
      status: attachment.mockIssuedDocument.status,
      metadata: [
        { label: "Requirement", value: attachment.requirementName ?? "Not provided" },
        { label: "Issuer", value: attachment.mockIssuedDocument.issuer },
        { label: "Issue date", value: formatDate(attachment.mockIssuedDocument.issueDate) },
        { label: "Reference mode", value: attachment.mockIssuedDocument.mode },
      ],
    })),
    ...review.generatedDocuments.map((document) => ({
      id: `generated-${document.generatedDocumentId}`,
      category: "GENERATED DOCUMENT" as const,
      title: document.documentName,
      subtitle: document.documentType,
      status: document.signatureStatus,
      metadata: [
        { label: "Document type", value: document.documentType },
        { label: "Generated", value: formatDate(document.generatedAt) },
        { label: "Signed", value: formatDate(document.signedAt) },
        { label: "Mode", value: document.mode },
      ],
    })),
  ];
}

export function DocumentReviewPage({ applicationId, onNavigateAiPreVerification, onNavigateApplicationDetails, onNavigateApplications, onNavigateCompleted, onNavigateProfile, onNavigateDashboard, onSessionExpired, onReturnToLogin }: DocumentReviewPageProps) {
  const { review, isLoading, error, refresh } = useApplicationReview(applicationId, onSessionExpired);
  const records = useMemo(() => buildRecords(review), [review]);
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<DocumentReviewAction | null>(null);

  useEffect(() => {
    if (!records.length) setSelectedRecordId(null);
    else if (!records.some((record) => record.id === selectedRecordId)) setSelectedRecordId(records[0].id);
  }, [records, selectedRecordId]);

  const selectedRecord = records.find((record) => record.id === selectedRecordId) ?? null;
  const canReviewDocument = selectedRecord?.category === "UPLOADED DOCUMENT" && Boolean(selectedRecord.documentId);

  async function updateDocument(action: DocumentReviewAction): Promise<void> {
    if (!selectedRecord?.documentId) return;
    const trimmedNote = note.trim();
    if (trimmedNote.length < 3 || trimmedNote.length > 1000) {
      setActionError("Enter an officer note between 3 and 1000 characters before recording this document review action.");
      return;
    }

    setPendingAction(action);
    setActionError(null);
    try {
      await employeeApi.reviewDocument(selectedRecord.documentId, { action, note: trimmedNote });
      setNote("");
      await refresh();
    } catch (requestError) {
      if (requestError instanceof ApiError && (requestError.status === 401 || requestError.status === 403)) onSessionExpired();
      else setActionError(requestError instanceof ApiError ? requestError.message : "The document review action could not be recorded.");
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <div className="dashboard-shell">
      <EmployeeHeader activeView="applications" onNavigateDashboard={onNavigateDashboard} onNavigateApplications={onNavigateApplications} onNavigateCompleted={onNavigateCompleted} onNavigateProfile={onNavigateProfile} onReturnToLogin={onReturnToLogin} />

      <main className="document-review-page">
        <button className="details-back" type="button" onClick={onNavigateApplicationDetails}>Back to application details</button>

        <section className="document-review-intro" aria-labelledby="document-review-title">
          <div>
            <p className="eyebrow">DOCUMENT REVIEW · DEMO / PROTOTYPE</p>
            <h1 id="document-review-title">Document review workspace</h1>
            <p>{review ? `${review.applicationNumber} · ${review.service.name} · ${review.applicant.fullName}` : "Loading authorized application review metadata…"}</p>
          </div>
          <span className="preview-badge">{isLoading ? "LOADING" : "SAFE METADATA ONLY"}</span>
        </section>

        <aside className="details-disclaimer" role="note">
          <strong>Metadata, not files.</strong>
          <span>Uploaded document metadata, read-only mock issued-document references, and generated-document state are distinct records. No document bytes, storage URLs, or live government registry data are exposed.</span>
        </aside>

        {error ? <aside className="details-disclaimer" role="alert"><strong>Review unavailable.</strong><span>{error}</span><button className="queue-panel__link" type="button" onClick={() => void refresh()}>Retry</button></aside> : null}

        <section className="document-review-layout" aria-label="Application document review workspace">
          <aside className="document-list-panel" aria-labelledby="document-list-title">
            <header><p className="panel-kicker">DOCUMENT REGISTRY</p><h2 id="document-list-title">Authorized application records</h2></header>
            <div className="document-list">
              {isLoading ? <p className="document-list-panel__note">Loading document metadata…</p> : null}
              {!isLoading && records.length === 0 ? <p className="document-list-panel__note">No uploaded document, mock issued reference, or generated-document metadata is available for this application.</p> : null}
              {records.map((record) => (
                <button className={`document-list__item ${record.id === selectedRecordId ? "document-list__item--active" : ""}`} type="button" key={record.id} onClick={() => setSelectedRecordId(record.id)} aria-pressed={record.id === selectedRecordId}>
                  <span>{record.title}</span><small>{record.subtitle}</small><em>{record.category}</em>
                </button>
              ))}
            </div>
            <p className="document-list-panel__note">Mock issued references are read-only demo registry records. Only uploaded documents can receive employee document-review actions.</p>
          </aside>

          <section className="document-preview-panel" aria-labelledby="document-preview-title">
            <header className="document-preview-panel__header"><div><p className="panel-kicker">METADATA RECORD</p><h2 id="document-preview-title">{selectedRecord?.title ?? "No record selected"}</h2></div><span className="detail-status">{selectedRecord?.status ?? "UNAVAILABLE"}</span></header>
            <div className="mock-document-sheet" aria-label="Safe document metadata only">
              <p className="mock-document-sheet__watermark">NO FILE PREVIEW</p>
              <div className="mock-document-sheet__heading"><span className="mock-document-sheet__mark" aria-hidden="true">JX</span><div><strong>{selectedRecord?.category ?? "APPLICATION RECORD"}</strong><span>DEMO / PROTOTYPE · Safe employee metadata</span></div></div>
              <dl>
                {selectedRecord?.metadata.map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}
                {selectedRecord?.diagnostics ? <div><dt>Advisory diagnostics</dt><dd>{selectedRecord.diagnostics.recommendation ?? "Provided without a recommendation"}</dd></div> : null}
              </dl>
              <p className="mock-document-sheet__footer">This panel intentionally presents metadata only. It is not an uploaded-file renderer, identity-document image, or government credential preview.</p>
            </div>
            <div className="document-preview-panel__metadata">
              <div><span>Record category</span><strong>{selectedRecord?.category ?? "Not selected"}</strong></div>
              <div><span>Review availability</span><strong>{canReviewDocument ? "Uploaded document review available" : "Read-only reference or state"}</strong></div>
              <div><span>Diagnostics</span><strong>{selectedRecord?.diagnostics ? "Advisory prototype data available" : "Not provided"}</strong></div>
              <div><span>Application state</span><strong>{review?.status ?? "Loading"}</strong></div>
            </div>
          </section>
        </section>

        <section className="document-review-actions" aria-labelledby="document-review-actions-title">
          <div>
            <p className="panel-kicker">OFFICER REVIEW STATE</p>
            <h2 id="document-review-actions-title">Review controls</h2>
            <p>{canReviewDocument ? "Record an authorized officer decision for the selected uploaded document. The workspace refreshes from the backend after success." : "Select an uploaded document to record a review action. Mock issued references and generated-document records remain read-only."}</p>
            {canReviewDocument ? <label className="review-note"><span>Officer note</span><textarea value={note} maxLength={1000} onChange={(event) => { setNote(event.target.value); setActionError(null); }} placeholder="Required: 3–1000 characters" /></label> : null}
            {actionError ? <p className="field-error" role="alert">{actionError}</p> : null}
          </div>
          <div className="document-review-actions__buttons">
            <button type="button" disabled={!canReviewDocument || pendingAction !== null} onClick={() => void updateDocument("VERIFY")}>{pendingAction === "VERIFY" ? "Recording…" : "Mark verified"}</button>
            <button type="button" disabled={!canReviewDocument || pendingAction !== null} onClick={() => void updateDocument("REQUEST_CORRECTION")}>{pendingAction === "REQUEST_CORRECTION" ? "Recording…" : "Request correction"}</button>
            <button type="button" disabled={!canReviewDocument || pendingAction !== null} onClick={() => void updateDocument("REJECT")}>{pendingAction === "REJECT" ? "Recording…" : "Reject document"}</button>
            <button className="document-review-actions__next" type="button" disabled={!review || isLoading} onClick={onNavigateAiPreVerification}>AI pre-verification · next step</button>
          </div>
        </section>
      </main>

      <footer className="dashboard-footer"><span>JANSEVA-X Employee Desk</span><span>Demo environment · Safe prototype metadata only</span></footer>
    </div>
  );
}
