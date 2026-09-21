import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { citizenApi } from "../api/citizen";
import { ApiError, saveBlob } from "../api/client";
import { useAuth } from "../app/AuthContext";
import { DataSummary, DemoNotice, EmptyState, ErrorMessage, Loading, StatusBadge, SuccessMessage, formatDate } from "../components/Ui";
import type { ApplicationDetail, ApplicationSummary, GeneratedDocument, MockIssuedDocument, Service, SubmissionTicket } from "../types/api";
import { useCopilot } from "../copilot/CopilotContext";

function useRequest<T>(request: () => Promise<T>, dependencies: unknown[]) {
  const [data, setData] = useState<T | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  const load = async () => { setLoading(true); setError(""); try { setData(await request()); } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to load this page."); } finally { setLoading(false); } };
  useEffect(() => { void load(); }, dependencies); // eslint-disable-line react-hooks/exhaustive-deps
  return { data, loading, error, reload: load, setData };
}

export function DashboardPage() {
  const { user } = useAuth(); const navigate = useNavigate(); const profile = useRequest(() => citizenApi.profile(), []); const apps = useRequest(() => citizenApi.applications("?page=1&limit=5"), []);
  if (profile.loading || apps.loading) return <Loading label="Loading your dashboard" />;
  return <><section className="welcome-card"><div><p className="eyebrow">CITIZEN DASHBOARD</p><h1>Welcome, {profile.data?.profile.fullName ?? user?.citizenProfile?.fullName ?? "citizen"}</h1><p>Manage your JANSEVA-X prototype applications and documents.</p></div><button className="button secondary" onClick={() => navigate("/profile")}>Manage profile</button></section><DemoNotice /><section className="quick-grid"><Link className="quick-card" to="/services"><span>01</span><h2>Services</h2><p>Browse active prototype service records.</p></Link><Link className="quick-card" to="/applications"><span>02</span><h2>My applications</h2><p>Track applications returned for your account.</p></Link><Link className="quick-card" to="/documents"><span>03</span><h2>Issued demo documents</h2><p>View actual generated completion documents.</p></Link></section><section className="section-heading"><div><p className="eyebrow">APPLICATIONS</p><h2>Recent applications</h2></div><Link to="/applications">View all</Link></section>{apps.error && <ErrorMessage message={apps.error} />}{!apps.error && apps.data?.applications.length === 0 && <EmptyState title="No applications yet" text="Start with an active prototype service when you are ready." action={<Link className="button primary" to="/services">Browse services</Link>} />}{apps.data?.applications.map((application) => <ApplicationCard key={application.applicationId} application={application} />)}</>;
}

function ApplicationCard({ application }: { application: ApplicationSummary }) { return <article className="application-card"><div><p className="eyebrow">{application.service.name}</p><h3>{application.applicationNumber}</h3><p>Last updated {formatDate(application.updatedAt)}</p></div><div className="application-card-actions"><StatusBadge status={application.status} /><Link className="button secondary" to={`/applications/${application.applicationId}`}>View details</Link></div></article>; }

export function ServicesPage() {
  const request = useRequest(() => citizenApi.services(), []); const [search, setSearch] = useState(""); const services = useMemo(() => request.data?.services.filter((service) => `${service.name} ${service.description ?? ""}`.toLowerCase().includes(search.toLowerCase())) ?? [], [request.data, search]);
  return <><section className="hero"><p className="eyebrow">SERVICE CATALOGUE</p><h1>Government services directory</h1><p>Select an active JANSEVA-X prototype service to begin an application.</p><input className="search" aria-label="Search services" placeholder="Search services" value={search} onChange={(e) => setSearch(e.target.value)} /></section><DemoNotice>{"Service definitions and requirements are prototype records, not legally authoritative government guidance."}</DemoNotice>{request.loading && <Loading label="Loading services" />}{request.error && <ErrorMessage message={request.error} />}{!request.loading && !request.error && <section className="service-grid">{services.map((service) => <article className="service-card" key={service.serviceId}><p className="eyebrow">ACTIVE SERVICE</p><h2>{service.name}</h2><p>{service.description ?? "No description is available."}</p><Link className="button primary" to={`/services/${service.serviceId}`}>View service</Link></article>)}</section>}{!request.loading && !request.error && services.length === 0 && <EmptyState title="No matching services" text="Try a different search term." />}</>;
}

export function ServiceDetailPage() {
  const { serviceId = "" } = useParams(); const navigate = useNavigate(); const request = useRequest(() => citizenApi.service(serviceId), [serviceId]); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const start = async () => { setBusy(true); setError(""); try { const result = await citizenApi.createApplication(serviceId); navigate(`/applications/${result.application.applicationId}`); } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to start an application."); } finally { setBusy(false); } };
  if (request.loading) return <Loading label="Loading service" />; if (request.error || !request.data) return <ErrorMessage message={request.error || "Service not found."} />; const service = request.data.service;
  return <><Link className="back-link" to="/services">Back to services</Link><section className="hero split"><div><p className="eyebrow">ACTIVE PROTOTYPE SERVICE</p><h1>{service.name}</h1><p>{service.description ?? "No description is available."}</p></div><div className="action-panel"><p>Applications begin as drafts.</p><button className="button primary" onClick={() => void start()} disabled={busy}>{busy ? "Starting..." : "Start application"}</button></div></section>{error && <ErrorMessage message={error} />}<DemoNotice>{"Requirements below are prototype configuration supplied by the backend. Uploads support PDF, JPG, JPEG, and PNG files up to 10 MB."}</DemoNotice><section className="requirements"><h2>Requirements</h2>{service.requirements?.length ? service.requirements.map((requirement) => <article className="requirement" key={requirement.requirementId}><span>{requirement.isRequired ? "Required" : "Optional"}</span><div><h3>{requirement.name}</h3><p>{requirement.description ?? "No description is available."}</p></div></article>) : <EmptyState title="No requirements returned" text="This active service has no listed requirements." />}</section></>;
}

export function ApplicationsPage() {
  const [params, setParams] = useSearchParams(); const page = Number(params.get("page") ?? "1"); const status = params.get("status") ?? ""; const query = `?page=${page}&limit=10${status ? `&status=${status}` : ""}`; const request = useRequest(() => citizenApi.applications(query), [query]);
  const setStatus = (next: string) => setParams(next ? { status: next, page: "1" } : { page: "1" });
  return <><section className="section-heading"><div><p className="eyebrow">MY APPLICATIONS</p><h1>Applications</h1></div><Link className="button primary" to="/services">Browse services</Link></section><label className="filter">Filter by status<select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option>{["DRAFT", "IDENTITY_VERIFIED", "SUBMITTED", "DOCUMENTS_VERIFIED", "UNDER_REVIEW", "CORRECTION_REQUIRED", "APPROVED", "REJECTED", "SIGNED", "COMPLETED"].map((item) => <option key={item}>{item}</option>)}</select></label>{request.loading && <Loading label="Loading applications" />}{request.error && <ErrorMessage message={request.error} />}{request.data?.applications.map((application) => <ApplicationCard application={application} key={application.applicationId} />)}{request.data?.applications.length === 0 && <EmptyState title="No applications found" text="There are no applications for this filter." />} {request.data && request.data.pagination.totalPages > 1 && <div className="pagination"><button className="button secondary" disabled={page <= 1} onClick={() => setParams({ ...(status ? { status } : {}), page: String(page - 1) })}>Previous</button><span>Page {page} of {request.data.pagination.totalPages}</span><button className="button secondary" disabled={page >= request.data.pagination.totalPages} onClick={() => setParams({ ...(status ? { status } : {}), page: String(page + 1) })}>Next</button></div>}</>;
}

export function ApplicationDetailPage() {
  const { applicationId = "" } = useParams(); const request = useRequest(() => citizenApi.application(applicationId), [applicationId]);
  if (request.loading && !request.data) return <Loading label="Loading application" />; if (request.error || !request.data) return <ErrorMessage message={request.error || "Application not found."} />; const application = request.data.application;
  return <><Link className="back-link" to="/applications">Back to applications</Link><section className="hero split"><div><p className="eyebrow">APPLICATION {application.applicationNumber}</p><h1>{application.service.name}</h1><p>Created {formatDate(application.createdAt)}</p></div><StatusBadge status={application.status} /></section><ApplicationActions application={application} reload={request.reload} />{application.status === "DRAFT" ? <DraftEditor application={application} reload={request.reload} /> : <section className="detail-grid"><section className="card"><h2>Application data</h2><DataSummary data={application.applicationData} emptyMessage="No additional draft data has been saved." /></section><section className="card"><h2>Service requirements</h2>{application.service.requirements.map((requirement) => <p key={requirement.requirementId}><strong>{requirement.isRequired ? "Required: " : "Optional: "}</strong>{requirement.name}</p>)}</section></section>}<StatusTimeline application={application} /><GeneratedList applicationId={application.applicationId} applicationStatus={application.status} /></>;
}

function DraftEditor({ application, reload }: { application: ApplicationDetail; reload: () => Promise<void> }) {
  const { preparationRequest, completePreparation } = useCopilot();
  const [value, setValue] = useState(JSON.stringify(application.applicationData ?? {}, null, 2));
  const [busy, setBusy] = useState(false); const [attachmentBusy, setAttachmentBusy] = useState(false);
  const [error, setError] = useState(""); const [attachmentError, setAttachmentError] = useState(""); const [success, setSuccess] = useState("");
  const issued = useRequest(() => citizenApi.issuedDocuments(), []);
  const preparationStarted = useRef(false);
  const applicationData = useMemo(() => jsonObject(value) ?? {}, [value]);
  const sourceFields = useMemo(() => documentAutofillMappings(issued.data?.documents ?? []).filter((mapping) => applicationData[mapping.field] === mapping.value), [applicationData, issued.data]);
  const attachmentCandidates = useMemo(() => compatibleMockAttachments(application.service.requirements, issued.data?.documents ?? [], application.mockIssuedDocumentAttachments), [application.mockIssuedDocumentAttachments, application.service.requirements, issued.data]);
  const fieldValue = (field: string) => typeof applicationData[field] === "string" ? applicationData[field] as string : "";
  const updateField = (field: string, nextValue: string | boolean) => setValue(JSON.stringify({ ...applicationData, [field]: nextValue }, null, 2));
  const sourceFor = (field: string) => sourceFields.find((mapping) => mapping.field === field)?.source;
  const saveDraft = async (onComplete?: (success: boolean, detail?: string) => void) => { setError(""); setSuccess(""); let parsed: unknown; try { parsed = JSON.parse(value); } catch { const detail = "Additional details must be valid JSON."; setError(detail); onComplete?.(false, detail); return; } if (!parsed || Array.isArray(parsed) || typeof parsed !== "object" || Object.keys(parsed as Record<string, unknown>).length === 0) { const detail = "Additional details must be a non-empty JSON object."; setError(detail); onComplete?.(false, detail); return; } setBusy(true); try { await citizenApi.updateApplication(application.applicationId, parsed as Record<string, unknown>); await reload(); setSuccess("Draft details saved."); onComplete?.(true); } catch (caught) { const detail = caught instanceof Error ? caught.message : "Unable to save draft details."; setError(detail); onComplete?.(false, detail); } finally { setBusy(false); } };
  const save = async (event: FormEvent) => { event.preventDefault(); await saveDraft(); };
  const autofill = async () => {
    setError(""); setAttachmentError(""); setSuccess("");
    const current = jsonObject(value);
    if (!current) { setError("Application data must be a JSON object before using Smart Document Auto-Fill."); return; }
    const next = { ...current };
    const results = documentAutofillMappings(issued.data?.documents ?? []).map((mapping) => {
      if (hasValue(next[mapping.field])) return `${mapping.label} — Already present; not overwritten.`;
      next[mapping.field] = mapping.value;
      return `${mapping.label} — Auto-filled from ${mapping.source}.`;
    });
    if (!results.length) { setError("No compatible values were found in the available mock issued documents."); return; }
    setValue(JSON.stringify(next, null, 2));

    if (!attachmentCandidates.length) {
      setSuccess(results.some((result) => result.includes("Auto-filled")) ? "Form auto-filled from mock issued documents. Review and edit it before saving." : "Existing application values were preserved; no fields were overwritten.");
      return;
    }

    setAttachmentBusy(true);
    const settled = await Promise.allSettled(attachmentCandidates.map((candidate) => citizenApi.attachMockIssuedDocument(application.applicationId, {
      mockIssuedDocumentId: candidate.document.documentId,
      requirementId: candidate.requirement.requirementId,
    })));
    const attachedCount = settled.filter((result) => result.status === "fulfilled").length;
    const failed = settled.filter((result): result is PromiseRejectedResult => result.status === "rejected");
    if (attachedCount > 0) await reload();
    if (failed.length) setAttachmentError(`Form auto-fill was kept, but ${failed.length} matching demo document attachment${failed.length === 1 ? "" : "s"} could not be completed. You can still upload documents normally.`);
    setSuccess(attachedCount > 0
      ? `Form auto-filled. ${attachedCount} matching demo document${attachedCount === 1 ? " was" : "s were"} automatically attached. Review your information and document attachments before continuing.`
      : "Form auto-filled. No demo document attachments were created; normal upload remains available.");
    setAttachmentBusy(false);
  };
  useEffect(() => {
    if (preparationStarted.current || preparationRequest?.kind !== "service" || preparationRequest.applicationId !== application.applicationId || issued.loading) return;
    preparationStarted.current = true;
    void autofill().finally(() => completePreparation(application.applicationId));
  }, [application.applicationId, issued.loading, preparationRequest, completePreparation]);
  useEffect(() => {
    const handleCopilotSave = (event: Event) => {
      const detail = (event as CustomEvent<{ applicationId?: string; onComplete?: (success: boolean, detail?: string) => void }>).detail;
      if (detail?.applicationId === application.applicationId && !busy) void saveDraft(detail.onComplete);
    };
    window.addEventListener("janseva-ai-save-draft", handleCopilotSave);
    return () => window.removeEventListener("janseva-ai-save-draft", handleCopilotSave);
  }, [application.applicationId, busy, value]);
  return <form className="card government-demo-form form-stack" onSubmit={save}>
    <header className="government-demo-header">
      <p className="government-demo-title">GOVERNMENT OF BHARAT — JANSEVA-X DEMO</p>
      <p className="government-demo-label">DEMO / MOCK FORM</p>
      <p className="muted">Not an official Government of India form</p>
      <div className="government-application-strip"><h2>{application.service.name.toUpperCase()} APPLICATION</h2><p><span>Application No: <strong>{application.applicationNumber}</strong></span><span>Status: <strong>DRAFT</strong></span></p></div>
    </header>
    <section className="government-form-section">
      <h3>SECTION 1 — APPLICANT DETAILS</h3>
      <div className="form-grid government-form-grid">
        <label>Full Name *<input value={fieldValue("fullName")} onChange={(event) => updateField("fullName", event.target.value)} required />{sourceFor("fullName") && <small className="field-source">✓ Auto-filled from {sourceFor("fullName")}</small>}</label>
        <label>Date of Birth *<input type="date" value={fieldValue("dateOfBirth")} onChange={(event) => updateField("dateOfBirth", event.target.value)} required />{sourceFor("dateOfBirth") && <small className="field-source">✓ Auto-filled from {sourceFor("dateOfBirth")}</small>}</label>
        <label>PAN / Document Reference<input value={fieldValue("panDocumentReference")} onChange={(event) => updateField("panDocumentReference", event.target.value)} />{sourceFor("panDocumentReference") && <small className="field-source">✓ Auto-filled from {sourceFor("panDocumentReference")}</small>}</label>
        <label>Qualification<input value={fieldValue("qualification")} onChange={(event) => updateField("qualification", event.target.value)} />{sourceFor("qualification") && <small className="field-source">✓ Auto-filled from {sourceFor("qualification")}</small>}</label>
      </div>
    </section>
    <section className="government-form-section">
      <h3>SECTION 2 — ADDRESS DETAILS</h3>
      <label className="government-address-field">Complete Address *<input value={fieldValue("address")} onChange={(event) => updateField("address", event.target.value)} required />{sourceFor("address") && <small className="field-source">✓ Auto-filled from {sourceFor("address")}</small>}</label>
    </section>
    <section className="government-form-section">
      <h3>SECTION 3 — DOCUMENT REQUIREMENTS</h3>
      <div className="requirements compact">{application.service.requirements.map((requirement) => {
        const attached = application.mockIssuedDocumentAttachments.find((item) => item.requirementId === requirement.requirementId);
        const available = matchingIssuedDocument(requirement.name, issued.data?.documents ?? []);
        return <article className="requirement" key={requirement.requirementId}><span>{requirement.isRequired ? "Required" : "Optional"}</span><div><h4>{requirement.name}</h4>{attached ? <><p><strong>✓ {attached.mockIssuedDocument.displayName}</strong></p><p className="muted">Auto-attached from your JANSEVA-X issued documents</p><small>DEMO / MOCK</small></> : <><p>{available ? "A compatible demo document is available. Use Auto-fill form to attach it." : "No matching demo document found."}</p><Link className="button secondary" to={`/applications/${application.applicationId}/documents`}>Upload document</Link></>}</div></article>;
      })}</div>
    </section>
    <section className="government-form-section">
      <div className="smart-autofill-panel"><p className="eyebrow">SMART DOCUMENT AUTO-FILL</p><p>We found information in your issued JANSEVA-X demo documents. JANSEVA-X can reuse information and matching available demo documents already linked to your profile. Auto-fill does not save, verify, or submit the application.</p>{issued.loading && <Loading label="Loading mock issued documents" />}{issued.error && <ErrorMessage message={issued.error} />}{!issued.loading && !issued.error && issued.data?.documents.length === 0 && <EmptyState title="No mock issued documents" text="No mock documents are available for this citizen profile." />}{issued.data?.documents.length ? <button className="button secondary" type="button" onClick={() => void autofill()} disabled={attachmentBusy}>{attachmentBusy ? "Attaching documents..." : "AUTO-FILL FORM"}</button> : null}{sourceFields.length > 0 && <div className="source-mapping-list"><div className="source-mapping-header"><span>FIELD</span><span>SOURCE</span></div>{sourceFields.map((mapping) => <div className="source-mapping-row" key={mapping.field}><span>{mapping.label}</span><span>{mapping.source}</span></div>)}</div>}</div>
      <div className="issued-document-reference-list">{issued.data?.documents.map((document) => <label className="issued-document-reference" key={document.documentId}><input type="checkbox" checked readOnly aria-label={`${document.displayName} is available`} /><span><strong>{document.displayName}</strong><small>Source: {document.issuer}</small><small>DEMO / MOCK</small></span></label>)}</div>
    </section>
    <section className="government-form-section declaration-box">
      <h3>SECTION 4 — APPLICANT DECLARATION</h3>
      <label className="checkbox"><input type="checkbox" checked={applicationData.declarationConfirmed === true} onChange={(event) => updateField("declarationConfirmed", event.target.checked)} />I confirm that the information entered in this DEMO application is correct.</label>
      <p className="muted">This is a JANSEVA-X prototype. All documents, identity verification and government services shown in this application are simulated for demonstration purposes.</p>
    </section>
    {error && <ErrorMessage message={error} />}{attachmentError && <ErrorMessage message={attachmentError} />}{success && <SuccessMessage message={success} />}
    <div className="government-form-actions"><button className="button primary" disabled={busy}>{busy ? "Saving..." : "Save Draft"}</button></div>
    <section className="requirements compact"><h3>Service requirements</h3>{application.service.requirements.map((requirement) => <p key={requirement.requirementId}><strong>{requirement.isRequired ? "Required: " : "Optional: "}</strong>{requirement.name}</p>)}</section>
  </form>;
}

function documentAutofillMappings(documents: MockIssuedDocument[]): Array<{ field: string; label: string; value: string; source: string }> {
  const aadhaar = documents.find((document) => document.documentType === "MOCK_AADHAAR_CARD"); const birthCertificate = documents.find((document) => document.documentType === "MOCK_BIRTH_CERTIFICATE"); const addressCertificate = documents.find((document) => document.documentType === "MOCK_ADDRESS_CERTIFICATE"); const panCard = documents.find((document) => document.documentType === "MOCK_PAN_CARD"); const marksheet = documents.find((document) => document.documentType === "MOCK_10TH_MARKSHEET");
  const aadhaarName = fieldValue(aadhaar, "holderName"); const aadhaarDateOfBirth = fieldValue(aadhaar, "dateOfBirth");
  const mappings = [
    mapping("fullName", "Full Name", aadhaarName ?? firstHolderName(documents), aadhaarName ? aadhaar?.displayName : firstHolderNameSource(documents)),
    mapping("dateOfBirth", "Date of Birth", aadhaarDateOfBirth ?? fieldValue(birthCertificate, "dateOfBirth"), aadhaarDateOfBirth ? aadhaar?.displayName : birthCertificate?.displayName),
    mapping("address", "Address", fieldValue(addressCertificate, "address"), addressCertificate?.displayName),
    mapping("panDocumentReference", "PAN/document reference", fieldValue(panCard, "documentReference"), panCard?.displayName),
    mapping("qualification", "Qualification", fieldValue(marksheet, "qualification"), marksheet?.displayName),
  ];
  return mappings.filter((item): item is { field: string; label: string; value: string; source: string } => item !== null);
}

function mockDocumentTypeForRequirementName(requirementName: string): string | null {
  const normalized = requirementName.trim().toLowerCase().replace(/\s+/g, " ");
  if (normalized === "identity proof") return "MOCK_AADHAAR_CARD";
  if (normalized === "pan" || normalized === "pan supporting document") return "MOCK_PAN_CARD";
  if (normalized === "address proof") return "MOCK_ADDRESS_CERTIFICATE";
  if (normalized === "birth record supporting document") return "MOCK_BIRTH_CERTIFICATE";
  if (/\b(education|qualification)\b/.test(normalized)) return "MOCK_10TH_MARKSHEET";
  return null;
}

function matchingIssuedDocument(requirementName: string, documents: MockIssuedDocument[]): MockIssuedDocument | undefined {
  const documentType = mockDocumentTypeForRequirementName(requirementName);
  return documentType ? documents.find((document) => document.documentType === documentType && document.status === "AVAILABLE" && (!document.expiryDate || new Date(document.expiryDate).getTime() >= Date.now())) : undefined;
}

function compatibleMockAttachments(requirements: ApplicationDetail["service"]["requirements"], documents: MockIssuedDocument[], existing: ApplicationDetail["mockIssuedDocumentAttachments"]) {
  return requirements.flatMap((requirement) => {
    if (existing.some((attachment) => attachment.requirementId === requirement.requirementId)) return [];
    const document = matchingIssuedDocument(requirement.name, documents);
    return document ? [{ requirement, document }] : [];
  });
}

function mapping(field: string, label: string, value: string | null, source: string | undefined): { field: string; label: string; value: string; source: string } | null { return value && source ? { field, label, value, source } : null; }
function jsonObject(value: string): Record<string, unknown> | null { try { const parsed: unknown = JSON.parse(value); return parsed && !Array.isArray(parsed) && typeof parsed === "object" ? parsed as Record<string, unknown> : null; } catch { return null; } }
function fieldValue(document: MockIssuedDocument | undefined, field: string): string | null { const value = document?.structuredFields?.[field]; return typeof value === "string" && value.trim() ? value.trim() : null; }
function firstHolderName(documents: MockIssuedDocument[]): string | null { for (const document of documents) { const value = fieldValue(document, "holderName"); if (value) return value; } return null; }
function firstHolderNameSource(documents: MockIssuedDocument[]): string | undefined { return documents.find((document) => fieldValue(document, "holderName"))?.displayName; }
function hasValue(value: unknown): boolean { return value !== null && value !== undefined && (typeof value !== "string" || value.trim().length > 0); }

function ApplicationActions({ application, reload }: { application: ApplicationDetail; reload: () => Promise<void> }) {
  const [completeBusy, setCompleteBusy] = useState(false); const [error, setError] = useState(""); const [success, setSuccess] = useState(""); const navigate = useNavigate();
  const complete = async () => { setCompleteBusy(true); setError(""); try { const result = await citizenApi.complete(application.applicationId); setSuccess(`Application ${result.status.toLowerCase()} successfully.`); await reload(); } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to acknowledge completion."); } finally { setCompleteBusy(false); } };
  const signableDocument = application.generatedDocuments.find((document) => document.signatureStatus !== "SIGNED");
  return <section className="action-row">{application.status === "DRAFT" && <><Link className="button secondary" to={`/applications/${application.applicationId}/documents`}>Manage documents</Link><Link className="button primary" to={`/applications/${application.applicationId}/verify`}>Verify identity</Link></>}{application.status === "IDENTITY_VERIFIED" && <Link className="button primary" to={`/applications/${application.applicationId}/review`}>Review and submit</Link>}{application.status === "SUBMITTED" && <Link className="button primary" to={`/submitted/${application.applicationId}`}>View processing status</Link>}{application.status === "SIGNED" && <><span className="muted">Mock e-sign recorded. Confirm completion to finish this DEMO / PROTOTYPE workflow.</span><button className="button primary" onClick={() => void complete()} disabled={completeBusy}>{completeBusy ? "Acknowledging..." : "Acknowledge completion"}</button></>}{application.status === "APPROVED" && (signableDocument ? <><span className="muted">Application approved. A generated demo document is ready for your explicit mock e-sign.</span><Link className="button primary" to={`/documents/${signableDocument.generatedDocumentId}/sign?application=${application.applicationId}`}>Review and mock e-sign</Link></> : <span className="muted">Application approved. A generated demo document will appear here after authorized issuance.</span>)}{application.status === "COMPLETED" && <span className="muted">Application completed through the citizen-owned DEMO / PROTOTYPE mock signing workflow.</span>}{error && <ErrorMessage message={error} />}{success && <SuccessMessage message={success} />}</section>;
}

function StatusTimeline({ application }: { application: ApplicationDetail }) { return <section className="card timeline"><h2>Application timeline</h2>{application.statusHistory.map((entry, index) => <div className="timeline-entry" key={`${entry.status}-${entry.createdAt}-${index}`}><StatusBadge status={entry.status} /><div><p>{entry.note ?? "Status updated"}</p><small>{formatDate(entry.createdAt)}</small></div></div>)}</section>; }

export function DraftReviewPage() {
  const { applicationId = "" } = useParams(); const request = useRequest(() => citizenApi.application(applicationId), [applicationId]); const navigate = useNavigate(); const [confirmed, setConfirmed] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const submit = async () => { if (busy) return; setBusy(true); setError(""); try { const result = await citizenApi.submit(applicationId, crypto.randomUUID()); navigate(`/submitted/${applicationId}`, { state: result }); } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to submit application."); } finally { setBusy(false); } };
  if (request.loading) return <Loading label="Loading application review" />; if (request.error || !request.data) return <ErrorMessage message={request.error || "Application not found."} />; const application = request.data.application;
  return <><Link className="back-link" to={`/applications/${applicationId}`}>Back to application</Link><section className="hero"><p className="eyebrow">APPLICATION REVIEW</p><h1>Review and submit</h1><p>{application.service.name} - {application.applicationNumber}</p></section><DemoNotice>{"Submission is available only after the backend confirms the application status as Identity verified (demo)."}</DemoNotice><section className="card"><h2>Documents</h2>{application.documents.length ? application.documents.map((document) => <p key={document.documentId}>{document.originalFilename} <span className="muted">({document.status})</span></p>) : <p>No documents are listed.</p>}<h2>Additional data</h2><DataSummary data={application.applicationData} emptyMessage="No additional application data has been saved." /><label className="checkbox"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />I confirm I have reviewed the application information shown above.</label></section>{error && <ErrorMessage message={error} />}<button className="button primary" disabled={application.status !== "IDENTITY_VERIFIED" || !confirmed || busy} onClick={() => void submit()}>{busy ? "Submitting..." : "Submit application"}</button>{application.status !== "IDENTITY_VERIFIED" && <p className="muted">The backend has not confirmed identity verification for this application yet.</p>}</>;
}

export function SubmittedPage() {
  const { applicationId = "" } = useParams();
  const [ticket, setTicket] = useState<SubmissionTicket | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const [retrying, setRetrying] = useState(false); const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true; let timer: number | undefined;
    const load = async () => {
      try {
        const result = await citizenApi.submissionTicket(applicationId);
        if (!active) return;
        setTicket(result.submissionTicket); setError("");
        if (result.submissionTicket.processingState === "PENDING" || result.submissionTicket.processingState === "PROCESSING") timer = window.setTimeout(() => { void load(); }, 5_000);
      } catch (caught) { if (active) setError(caught instanceof Error ? caught.message : "Unable to load submission processing status."); }
      finally { if (active) setLoading(false); }
    };
    void load();
    return () => { active = false; if (timer !== undefined) window.clearTimeout(timer); };
  }, [applicationId, refresh]);
  const retry = async () => { if (retrying) return; setRetrying(true); setError(""); try { const result = await citizenApi.retrySubmissionTicket(applicationId); setTicket(result.submissionTicket); setLoading(true); setRefresh((value) => value + 1); } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to retry background processing."); } finally { setRetrying(false); } };
  const current = ticket?.processingState ?? "PENDING";
  return <section className="success-panel"><p className="eyebrow">SUBMISSION RECEIVED</p><h1>Application processing</h1><p>Your application has been received. JANSEVA-X is processing it in the background. You do not need to keep this page open.</p>{loading && !ticket && <Loading label="Loading submission status" />}{error && <ErrorMessage message={error} />}{ticket && <section className="submission-tracker" aria-live="polite"><p className="muted">Tracking ticket: {ticket.ticketId}</p><ol className="submission-steps"><li className="complete">Submitted</li><li className={current === "PROCESSING" ? "active" : current === "COMPLETED" ? "complete" : ""}>Processing</li><li className={current === "COMPLETED" ? "complete" : current === "FAILED" ? "failed" : ""}>{current === "FAILED" ? "Processing failed" : "Completed"}</li></ol><p><strong>Current state:</strong> {current.replace("_", " ")}</p><p className="muted">Attempts: {ticket.attemptCount}. Received {formatDate(ticket.createdAt)}.</p>{ticket.processingStartedAt && <p className="muted">Processing started {formatDate(ticket.processingStartedAt)}.</p>}{ticket.completedAt && <SuccessMessage message={`Background processing completed ${formatDate(ticket.completedAt)}.`} />}{current === "FAILED" && <><ErrorMessage message={ticket.failureReason ?? "Background processing could not be completed."} /><button className="button primary" onClick={() => void retry()} disabled={retrying}>{retrying ? "Retrying..." : "Retry processing"}</button></>}</section>}<Link className="button secondary" to={`/applications/${applicationId}`}>View application</Link><Link className="button secondary" to="/">Return to dashboard</Link></section>;
}

export function ProfilePage() {
  const { user, refreshUser, signOut } = useAuth(); const request = useRequest(() => citizenApi.profile(), []); const [form, setForm] = useState<Record<string, string>>({}); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [success, setSuccess] = useState("");
  useEffect(() => { if (request.data?.profile) { const profile = request.data.profile; setForm({ fullName: profile.fullName ?? "", phone: profile.phone ?? "", dateOfBirth: profile.dateOfBirth ? profile.dateOfBirth.slice(0, 10) : "", address: profile.address ?? "", city: profile.city ?? "", state: profile.state ?? "", pincode: profile.pincode ?? "" }); } }, [request.data]);
  const submit = async (event: FormEvent) => { event.preventDefault(); const body = Object.fromEntries(Object.entries(form).filter(([, value]) => value !== "")); if (!Object.keys(body).length) { setError("Enter at least one profile value to save."); return; } setBusy(true); setError(""); try { await citizenApi.updateProfile(body); await request.reload(); await refreshUser(); setSuccess("Profile saved successfully."); } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to save profile."); } finally { setBusy(false); } };
  if (request.loading) return <Loading label="Loading profile" />; if (request.error) return <ErrorMessage message={request.error} />;
  return <><section className="hero split"><div><p className="eyebrow">CITIZEN PROFILE</p><h1>{request.data?.profile.fullName}</h1><p>{user?.email}</p></div></section><DemoNotice>{"Only the profile fields below are editable. Email and account security settings are not managed by this backend."}</DemoNotice><form className="card form-stack" onSubmit={submit}><div className="form-grid">{[["fullName", "Full name", "text"], ["phone", "Phone", "tel"], ["dateOfBirth", "Date of birth", "date"], ["address", "Address", "text"], ["city", "City", "text"], ["state", "State", "text"], ["pincode", "Pincode", "text"]].map(([name, label, type]) => <label key={name}>{label}<input type={type} value={form[name] ?? ""} onChange={(e) => setForm((previous) => ({ ...previous, [name]: e.target.value }))} /></label>)}</div>{error && <ErrorMessage message={error} />}{success && <SuccessMessage message={success} />}<button className="button primary" disabled={busy}>{busy ? "Saving..." : "Save profile"}</button></form><section className="card"><h2>Account actions</h2><p>End your current citizen session on this device.</p><button className="button danger" type="button" onClick={() => void signOut()}>Sign out</button></section></>;
}

function GeneratedList({ applicationId, applicationStatus }: { applicationId: string; applicationStatus: ApplicationDetail["status"] }) {
  const request = useRequest(() => citizenApi.generated(applicationId), [applicationId]); const navigate = useNavigate(); const [error, setError] = useState("");
  const downloadDocument = async (document: GeneratedDocument) => { setError(""); try { saveBlob(await citizenApi.downloadGenerated(document.generatedDocumentId), document.originalFilename ?? "janseva-x-demo-document.pdf"); } catch (caught) { setError(caught instanceof Error ? caught.message : "Document download failed."); } };
  return <section className="card"><h2>Generated demo documents</h2><DemoNotice>{"Only server-issued demo completion documents are shown here. They are not government-issued or legally valid."}</DemoNotice>{request.loading && <Loading label="Loading generated documents" />}{request.error && <ErrorMessage message={request.error} />}{error && <ErrorMessage message={error} />}{request.data?.documents.length === 0 && <p>No generated documents are available for this application.</p>}{request.data?.documents.map((document) => <div className="document-row" key={document.generatedDocumentId}><div><strong>{document.originalFilename ?? document.documentType}</strong><p>{document.documentType} - {document.signatureStatus}</p></div><div className="inline-actions"><button className="button secondary" onClick={() => void downloadDocument(document)}>Download PDF</button>{applicationStatus === "APPROVED" && document.signatureStatus !== "SIGNED" && <button className="button primary" onClick={() => navigate(`/documents/${document.generatedDocumentId}/sign?application=${applicationId}`)}>Mock e-sign</button>}</div></div>)}</section>;
}
