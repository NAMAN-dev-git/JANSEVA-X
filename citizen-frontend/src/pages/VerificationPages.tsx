import { FormEvent, useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { citizenApi } from "../api/citizen";
import { ApiError } from "../api/client";
import { useAuth } from "../app/AuthContext";
import { EmptyState, ErrorMessage, Loading, StatusBadge, SuccessMessage } from "../components/Ui";
import type { FingerprintSession, Verification, VerificationSummary } from "../types/api";

const fingerprintSteps = [
  { id: "RIGHT_INDEX", label: "Index Finger" },
  { id: "RIGHT_MIDDLE", label: "Middle Finger" },
  { id: "RIGHT_RING", label: "Ring Finger" },
  { id: "RIGHT_PINKY", label: "Little Finger" },
  { id: "RIGHT_THUMB", label: "Thumb" }
] as const;

const faceProgress = ["Face detected", "Checking face position", "Verifying", "Verification successful"];

function isFingerprint(value: unknown): value is FingerprintSession {
  return Boolean(value && typeof value === "object" && "sessionId" in value && "state" in value);
}

function formatApiError(error: unknown) {
  return error instanceof ApiError ? error.message : "We could not complete that request. Check your connection and try again.";
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));
}

function fingerprintMobileUrl(qrPayload: string): string | null {
  const configuredBase = String(import.meta.env.VITE_PUBLIC_LAN_URL || "").trim();
  const browserHost = window.location.hostname;
  const browserIsLoopback = browserHost === "localhost" || browserHost === "127.0.0.1" || browserHost === "[::1]";
  const base = configuredBase || (browserIsLoopback ? "" : window.location.origin);
  if (!base) return null;
  try {
    const url = new URL(base);
    const targetHost = url.hostname.toLowerCase();
    if (targetHost === "localhost" || targetHost === "127.0.0.1" || targetHost === "[::1]") return null;
    url.pathname = "/verify/fingerprint";
    url.search = `?payload=${encodeURIComponent(qrPayload)}`;
    return url.toString();
  } catch {
    return null;
  }
}

function parseFingerprintPayload(payload: string) {
  const match = /^JANSEVA-X-DEMO-FP:([^:]+):([^:]+)$/.exec(payload);
  return match ? { sessionId: match[1], pairingChallenge: match[2] } : null;
}

function useRequest<T>(request: () => Promise<T>, dependencies: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = async () => {
    setLoading(true); setError("");
    try { setData(await request()); }
    catch (caught) { setError(formatApiError(caught)); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, dependencies); // eslint-disable-line react-hooks/exhaustive-deps
  return { data, loading, error, reload: load };
}

export function VerificationPage() {
  const { applicationId } = useParams();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [session, setSession] = useState<FingerprintSession | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const applicationRequest = useRequest(
    () => citizenApi.application(applicationId!),
    [applicationId]
  );
  const verificationRequest = useRequest(
    () => citizenApi.verificationSummary(applicationId!),
    [applicationId]
  );

  const mergeFingerprintSession = (next: FingerprintSession) => {
    setSession((previous) => {
      const retainQr = previous?.sessionId === next.sessionId && next.state === "PENDING_PAIRING";
      return {
        ...next,
        qrPayload: next.qrPayload ?? (retainQr ? previous?.qrPayload : undefined),
        pairingChallenge: next.pairingChallenge ?? (retainQr ? previous?.pairingChallenge : undefined)
      };
    });
  };

  useEffect(() => {
    if (!session?.sessionId || session.state !== "PENDING_PAIRING") return;
    const interval = window.setInterval(() => {
      citizenApi
        .fingerprintStatus(session.sessionId)
        .then((next) => {
          mergeFingerprintSession(next);
          void Promise.all([applicationRequest.reload(), verificationRequest.reload()]);
        })
        .catch(() => undefined);
    }, 8000);
    return () => window.clearInterval(interval);
  }, [session?.sessionId, session?.state]);

  // Keep mounted content visible while an action refreshes existing data. If the
  // whole page returned to Loading here, FaceVerificationPanel would unmount,
  // run its cleanup, and stop an otherwise active camera stream.
  if ((!applicationRequest.data && applicationRequest.loading) || (!verificationRequest.data && verificationRequest.loading)) return <Loading label="Loading identity verification" />;
  if (applicationRequest.error || verificationRequest.error || !applicationRequest.data || !verificationRequest.data) return <ErrorMessage message={applicationRequest.error || verificationRequest.error || "Application not found."} />;

  const application = applicationRequest.data.application;
  const verification = verificationRequest.data;
  const face = verification.identityVerification.face;
  const act = async <T,>(name: string, task: () => Promise<T>): Promise<T> => {
    setBusy(name);
    setError("");
    setSuccess("");
    try {
      const result = await task();
      if (isFingerprint(result)) mergeFingerprintSession(result);
      setSuccess("Verification response received. Your application status has been refreshed.");
      await Promise.all([applicationRequest.reload(), verificationRequest.reload()]);
      return result;
    } catch (caught) {
      const message = formatApiError(caught);
      setError(message);
      throw caught;
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <Link className="back-link" to={`/applications/${application.applicationId}`}>Back to application</Link>
      <section className="hero split"><div><p className="eyebrow">APPLICATION VERIFICATION</p><h1>Verify your identity</h1><p>Complete the available demo verification steps before submitting your application.</p></div><button className="button secondary" onClick={() => navigate(`/applications/${application.applicationId}`)}>Back to application</button></section>
      {error && <ErrorMessage message={error} />}
      {success && <SuccessMessage message={success} />}
      <section className="verification-grid">
        <FaceVerificationPanel
          face={face}
          busy={busy !== null}
          onStart={() => act("face-start", () => citizenApi.startFace(application.applicationId))}
          onComplete={(verificationId) => act("face-complete", () => citizenApi.completeFace(verificationId))}
        />
        <FingerprintLaptop
          applicationId={application.applicationId}
          session={session}
          busy={busy !== null}
          onSession={mergeFingerprintSession}
          act={act}
        />
      </section>
      <MockIdentityChecks applicationId={application.applicationId} verification={verification} busy={busy !== null} act={act} />
      <VerificationSummaryPanel verification={verification} />
      {pathname.includes("/verify") && <p className="quiet-note">Verification providers in JANSEVA-X are clearly labelled demonstrations. They do not connect to Aadhaar, PAN, UIDAI, or any government biometric system.</p>}
    </>
  );
}

function FaceVerificationPanel({
  face,
  busy,
  onStart,
  onComplete
}: {
  face?: Verification | null;
  busy: boolean;
  onStart: () => Promise<Verification>;
  onComplete: (verificationId: string) => Promise<Verification>;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [phase, setPhase] = useState<"idle" | "camera" | "captured" | "verifying" | "verified">("idle");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState("");
  const [localBusy, setLocalBusy] = useState(false);
  const [progressStep, setProgressStep] = useState(0);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  const clearPreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
  };

  useEffect(() => () => stopCamera(), []);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  useEffect(() => {
    const video = videoRef.current;
    const stream = streamRef.current;
    if (phase !== "camera" || !video || !stream) return;
    video.srcObject = stream;
    void video.play().catch(() => setCameraError("The live camera preview could not be started. Please try again."));
  }, [phase]);

  const openCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("Camera access is not available in this browser. Use a browser with camera support and try again.");
      return false;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      streamRef.current = stream;
      setCameraError("");
      setPhase("camera");
      return true;
    } catch (caught) {
      const name = caught instanceof DOMException ? caught.name : "";
      setCameraError(
        name === "NotAllowedError"
          ? "Camera permission was denied. Allow camera access in your browser settings to continue this demo."
          : name === "NotFoundError"
            ? "No camera device was found. Connect a camera and try again."
            : "The camera could not be opened. Close other apps using it and try again."
      );
      return false;
    }
  };

  const begin = async () => {
    setLocalBusy(true);
    setCameraError("");
    setProgressStep(0);
    clearPreview();
    try {
      const opened = await openCamera();
      if (!opened) return;
      await onStart();
    } catch {
      stopCamera();
      setPhase("idle");
    } finally {
      setLocalBusy(false);
    }
  };

  const capture = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      setCameraError("The camera is still starting. Please wait a moment and try again.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      setCameraError("A local camera preview could not be captured. Please try again.");
      return;
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const photo = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    if (!photo) {
      setCameraError("A local camera preview could not be captured. Please try again.");
      return;
    }
    clearPreview();
    setPreviewUrl(URL.createObjectURL(photo));
    stopCamera();
    setPhase("captured");
    setCameraError("");
  };

  const verify = async () => {
    if (!face?.verificationId) {
      setCameraError("The face demo session is no longer available. Start the demo again.");
      setPhase("idle");
      return;
    }
    setLocalBusy(true);
    setCameraError("");
    setPhase("verifying");
    try {
      for (let index = 0; index < faceProgress.length - 1; index += 1) {
        setProgressStep(index);
        await delay(550);
      }
      await onComplete(face.verificationId);
      setProgressStep(faceProgress.length - 1);
      setPhase("verified");
    } catch {
      setPhase("captured");
    } finally {
      setLocalBusy(false);
    }
  };

  const cancel = () => {
    stopCamera();
    clearPreview();
    setCameraError("");
    setPhase("idle");
  };

  const showVerified = phase === "verified" || face?.status === "VERIFIED";
  const faceStatus = showVerified ? "VERIFIED" : face?.status || "NOT_STARTED";

  return (
    <article className="card verification-card face-demo">
      <div className="panel-heading"><div><span className="eyebrow">Face verification</span><h2>Camera face demo</h2></div><StatusBadge status={faceStatus} /></div>
      <p>Use your camera to capture a local preview, then complete a simulated verification result.</p>
      <p className="demo-notice">DEMO / PROTOTYPE — the captured image stays only in this browser. No image, face template, embedding, or biometric data is uploaded or stored.</p>
      {(phase === "camera" || phase === "captured" || phase === "verifying" || showVerified) && (
        <div className={`face-stage ${phase === "captured" || phase === "verifying" || showVerified ? "preview-stage" : ""}`}>
          {phase === "camera" && <video ref={videoRef} className="camera-preview" autoPlay muted playsInline aria-label="Live camera preview" />}
          {(phase === "captured" || phase === "verifying" || showVerified) && previewUrl && <img src={previewUrl} alt="Locally captured face preview" />}
          {!previewUrl && phase !== "camera" && <div className="camera-placeholder">No local preview is retained.</div>}
          {phase === "camera" && <><div className="face-frame" aria-hidden="true" /><div className="camera-guidance">Position your face inside the frame. Keep your face visible and look at the camera.</div></>}
          {phase === "verifying" && <div className="camera-guidance">{faceProgress[progressStep]}…</div>}
          {showVerified && <div className="camera-guidance verified-guidance">VERIFIED — simulated demo result</div>}
        </div>
      )}
      {cameraError && <ErrorMessage message={cameraError} />}
      {phase === "idle" && !showVerified && <button className="button primary" onClick={() => void begin()} disabled={localBusy || busy}>{localBusy ? "Opening camera..." : "Start face demo"}</button>}
      {phase === "camera" && <div className="inline-actions"><button className="button primary" onClick={() => void capture()} disabled={localBusy || busy}>Capture preview</button><button className="button secondary" onClick={cancel}>Cancel</button></div>}
      {phase === "captured" && <div className="inline-actions"><button className="button primary" onClick={() => void verify()} disabled={localBusy || busy}>{localBusy ? "Verifying..." : "Verify captured preview"}</button><button className="button secondary" onClick={() => void begin()} disabled={localBusy || busy}>Retake preview</button><button className="button secondary" onClick={cancel}>Cancel</button></div>}
      {phase === "verifying" && <Loading label="Completing the simulated face verification…" />}
      {showVerified && <SuccessMessage message="VERIFIED — Simulated demo result; no real biometric matching occurred." />}
    </article>
  );
}

function FingerprintLaptop({
  applicationId,
  session,
  busy,
  onSession,
  act
}: {
  applicationId: string;
  session: FingerprintSession | null;
  busy: boolean;
  onSession: (session: FingerprintSession) => void;
  act: <T,>(name: string, task: () => Promise<T>) => Promise<T>;
}) {
  const start = async () => {
    try {
      const next = await act("fingerprint-start", () => citizenApi.startFingerprint(applicationId));
      onSession(next);
    } catch {
      // The shared error alert explains the failure.
    }
  };
  const refresh = async () => {
    if (!session) return;
    try {
      const next = await act("fingerprint-refresh", () => citizenApi.fingerprintStatus(session.sessionId));
      onSession(next);
    } catch {
      // The shared error alert explains the failure.
    }
  };
  const paired = session?.state === "PAIRED";
  const expired = session?.state === "EXPIRED";
  const showQr = session?.state === "PENDING_PAIRING" && Boolean(session.qrPayload);
  const mobileUrl = session?.qrPayload ? fingerprintMobileUrl(session.qrPayload) : null;

  return (
    <article className="card verification-card">
      <div className="panel-heading"><div><span className="eyebrow">Fingerprint verification</span><h2>QR-paired fingerprint demo</h2></div><StatusBadge status={session?.state || "NOT_STARTED"} /></div>
      <p>Pair a phone to continue the deterministic five-finger demonstration.</p>
      <p className="demo-notice">DEMO / PROTOTYPE — no real fingerprint data is captured, transmitted, or stored.</p>
      {!session && <button className="button primary" onClick={() => void start()} disabled={busy}>{busy ? "Starting..." : "Start demo fingerprint session"}</button>}
      {showQr && mobileUrl && <div className="qr-wrap"><QRCodeSVG value={mobileUrl} size={170} includeMargin /><div><strong>Scan this QR code with your phone</strong><p>Keep this page open while pairing. The QR remains available until the session is paired or expires.</p><small>Session expires {new Date(session.expiresAt).toLocaleTimeString()}.</small></div></div>}
      {showQr && !mobileUrl && <ErrorMessage message="A phone-reachable LAN URL is not configured. Set VITE_PUBLIC_LAN_URL to this laptop's LAN address (for example, http://192.168.x.x:5173) and restart Vite." />}
      {session?.state === "PENDING_PAIRING" && !session.qrPayload && <ErrorMessage message="The pairing QR is unavailable for this session. Start a new demo fingerprint session." />}
      {paired && <SuccessMessage message="Phone paired. Continue the clearly labelled demo sequence on the paired phone." />}
      {session?.state === "COMPLETED" && <SuccessMessage message="VERIFIED — Simulated five-finger verification; no real biometric matching occurred." />}
      {expired && <ErrorMessage message="This demo fingerprint session has expired. Start a new session to generate a new QR code." />}
      {session && session.state !== "COMPLETED" && <div className="inline-actions"><button className="button secondary" onClick={() => void refresh()} disabled={busy}>{busy ? "Refreshing..." : "Refresh session status"}</button>{expired && <button className="button primary" onClick={() => void start()} disabled={busy}>Start new session</button>}</div>}
      <p className="quiet-note">The QR contains only a temporary, one-time demo session payload. It contains no Aadhaar, PAN, document, or biometric data.</p>
    </article>
  );
}

function MockIdentityChecks({
  applicationId,
  verification,
  busy,
  act
}: {
  applicationId: string;
  verification: VerificationSummary;
  busy: boolean;
  act: <T,>(name: string, task: () => Promise<T>) => Promise<T>;
}) {
  const [aadhaar, setAadhaar] = useState("");
  const [pan, setPan] = useState("");
  const [localError, setLocalError] = useState("");
  const aadhaarVerified = verification.identityVerification.aadhaar?.status === "VERIFIED";
  const panVerified = verification.identityVerification.pan?.status === "VERIFIED";
  const ekycCompleted = verification.identityVerification.ekyc?.status === "COMPLETED";
  const verifyAadhaar = async (event: FormEvent) => {
    event.preventDefault();
    if (!aadhaar.trim()) { setLocalError("Enter a valid demo Aadhaar value or masked format."); return; }
    setLocalError("");
    try { await act("aadhaar", () => citizenApi.aadhaar(applicationId, aadhaar.trim())); }
    catch { /* The shared error alert explains the failure. */ }
  };
  const verifyPan = async (event: FormEvent) => {
    event.preventDefault();
    if (!pan.trim()) { setLocalError("Enter a valid demo PAN value or masked format."); return; }
    setLocalError("");
    try { await act("pan", () => citizenApi.pan(applicationId, pan.trim().toUpperCase())); }
    catch { /* The shared error alert explains the failure. */ }
  };
  const completeEkyc = async () => {
    setLocalError("");
    try { await act("ekyc", () => citizenApi.ekyc(applicationId)); }
    catch { /* The shared error alert explains the failure. */ }
  };

  return <section className="card mock-checks"><div className="panel-heading"><div><p className="eyebrow">Identity checks</p><h2>Mock Aadhaar, PAN and e-KYC</h2></div></div><p>These deterministic prototype checks are not connected to UIDAI, CBDT, PAN, or any government e-KYC system.</p>{localError && <ErrorMessage message={localError} />}<div className="form-grid"><form className="form-stack" onSubmit={verifyAadhaar}><label>Demo Aadhaar<input value={aadhaar} onChange={(event) => setAadhaar(event.target.value)} placeholder="XXXX-XXXX-1234" disabled={aadhaarVerified || busy} /></label><button className="button secondary" type="submit" disabled={aadhaarVerified || busy}>{aadhaarVerified ? "Aadhaar verified" : busy ? "Checking..." : "Verify Aadhaar demo"}</button></form><form className="form-stack" onSubmit={verifyPan}><label>Demo PAN<input value={pan} onChange={(event) => setPan(event.target.value.toUpperCase())} placeholder="ABCDE1234F" disabled={panVerified || busy} /></label><button className="button secondary" type="submit" disabled={panVerified || busy}>{panVerified ? "PAN verified" : busy ? "Checking..." : "Verify PAN demo"}</button></form></div><div className="inline-actions"><button className="button secondary" onClick={() => void completeEkyc()} disabled={!aadhaarVerified || !panVerified || ekycCompleted || busy}>{ekycCompleted ? "Mock e-KYC completed" : "Complete mock e-KYC"}</button>{(!aadhaarVerified || !panVerified) && <span className="muted">Mock e-KYC becomes available after mock Aadhaar and PAN checks are verified.</span>}</div></section>;
}

function VerificationSummaryPanel({ verification }: { verification: VerificationSummary }) {
  const verified = Object.entries(verification.identityVerification).filter(([, item]) => item?.status === "VERIFIED");
  return <section className="card verification-summary"><h2>Verification status</h2>{verified.length ? <ul className="summary-list">{verified.map(([type, item]) => <li key={item!.verificationId}><span>{type === "face" ? "Face demo" : type}</span><StatusBadge status={item!.status} /></li>)}</ul> : <EmptyState title="No completed verification" text="Complete an available verification step to update this application." />}</section>;
}

export function FingerprintMobilePage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const parsedPayload = parseFingerprintPayload(searchParams.get("payload") || "");
  const sessionId = parsedPayload?.sessionId || searchParams.get("sessionId") || "";
  const pairingChallenge = parsedPayload?.pairingChallenge || searchParams.get("pairingChallenge") || "";
  const [session, setSession] = useState<FingerprintSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (!sessionId || !user) return;
    citizenApi.fingerprintStatus(sessionId).then(setSession).catch((caught) => setError(formatApiError(caught)));
  }, [sessionId, user]);

  const pair = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      const next = await citizenApi.pairFingerprint(sessionId, pairingChallenge);
      setSession(next); setSuccess("Phone paired. Continue the simulated five-finger sequence.");
    } catch (caught) { setError(formatApiError(caught)); } finally { setBusy(false); }
  };
  const completeStep = async () => {
    if (!session?.currentStep) return;
    const currentFinger = fingerprintSteps.find((finger) => finger.id === session.currentStep);
    if (!currentFinger) return;
    setBusy(true); setError("");
    try {
      await delay(450);
      const next = await citizenApi.completeFingerprintStep(session.sessionId, session.currentStep);
      setSession(next);
      setSuccess(next.completedSteps.length === fingerprintSteps.length ? "5/5 Finger Verification Complete" : `${currentFinger.label} verified. Continue to the next simulated step.`);
    } catch (caught) { setError(formatApiError(caught)); } finally { setBusy(false); }
  };
  const paired = session?.state === "PAIRED";
  const complete = session?.state === "COMPLETED";
  const currentIndex = session?.completedSteps.length ?? 0;
  const currentFinger = session?.currentStep ? fingerprintSteps.find((finger) => finger.id === session.currentStep) : null;

  if (authLoading) return <Loading label="Restoring session" />;
  return <main className="mobile-page"><div className="brand">JANSEVA-X</div><span className="eyebrow">Mobile companion</span><h1>Demo fingerprint verification</h1><p>Demo biometric verification — simulated five-finger flow. Your device is not asked to capture fingerprint images or biometric data.</p>{!user ? <section className="card"><ErrorMessage message="Sign in with the same citizen account on this phone before pairing the demo session." /><Link className="button primary" to="/login">Sign in</Link></section> : <>{error && <ErrorMessage message={error} />}{success && <SuccessMessage message={success} />}{!sessionId || !pairingChallenge ? <ErrorMessage message="This QR link is incomplete or invalid. Return to the laptop portal and start a new session." /> : !session ? <Loading label="Checking the demo session" /> : session.state === "PENDING_PAIRING" ? <form onSubmit={pair} className="card"><h2>Pair this phone</h2><p>Pair this phone with the temporary demo session. No device biometric data is requested.</p><button className="button primary" type="submit" disabled={busy}>{busy ? "Pairing..." : "Pair phone"}</button></form> : paired || complete ? <section className="card"><div className="panel-heading"><h2>{complete ? "Identity verified" : "Complete the demo sequence"}</h2><StatusBadge status={session.state} /></div><p>{complete ? "VERIFIED — Simulated five-finger verification; no real biometric matching occurred." : `Current finger: ${currentFinger?.label ?? "Not available"}`}</p><ol className="finger-list">{fingerprintSteps.map((finger, index) => <li key={finger.id} className={index < currentIndex || complete ? "complete" : index === currentIndex ? "active" : ""}><span>{index + 1}</span><div><strong>{finger.label}</strong><small>{index < currentIndex || complete ? "Verified" : index === currentIndex ? busy ? "Scanning…" : "Ready to scan" : "Pending"}</small></div></li>)}</ol>{!complete && <button className="button primary" onClick={() => void completeStep()} disabled={busy || !currentFinger}>{busy ? "Scanning..." : `Verify ${currentFinger?.label ?? "next finger"}`}</button>}{complete && <button className="button primary" onClick={() => navigate("/")}>Return to portal</button>}</section> : <ErrorMessage message={session.state === "EXPIRED" ? "This demo session expired. Return to the laptop portal and generate a new QR code." : "This demo session is not ready for phone verification."} />}</>}<p className="quiet-note">This is a simulated prototype. JANSEVA-X does not access, store, or identify real fingerprints.</p></main>;
}

export function VerificationLinkPage() {
  const { applicationId } = useParams();
  return <main className="page-shell"><section className="hero"><p className="eyebrow">VERIFICATION</p><h1>Open identity verification</h1><p>Continue the approved verification workflow for this application.</p></section><Link className="button primary" to={`/applications/${applicationId}/verify`}>Open verification</Link></main>;
}
