import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { citizenApi } from "../api/citizen";
import { ErrorMessage, Loading, SuccessMessage } from "../components/Ui";
import type { Service } from "../types/api";
import { matchCopilotIntent, type CopilotMatch, type CopilotMatchKind } from "./intent-matching";

type MatchKind = CopilotMatchKind;
type CatalogMatch = CopilotMatch;
type Assistance = CatalogMatch & { applicationId?: string; preparationRequested?: boolean; preparationComplete?: boolean; submitted?: boolean; draftSaved?: boolean };
type VoiceState = "idle" | "listening" | "recognized" | "processing" | "matched" | "error" | "unsupported";
type SpeechResult = { isFinal: boolean; 0: { transcript: string } };
type SpeechEvent = { resultIndex?: number; results: { length: number; [index: number]: SpeechResult } };
type SpeechError = { error?: string; message?: string };
type SpeechEventHandler = (() => void) | null;
type Recognition = { lang: string; continuous: boolean; interimResults: boolean; maxAlternatives: number; onstart: SpeechEventHandler; onaudiostart: SpeechEventHandler; onsoundstart: SpeechEventHandler; onspeechstart: SpeechEventHandler; onresult: ((event: SpeechEvent) => void) | null; onnomatch: SpeechEventHandler; onerror: ((event: SpeechError) => void) | null; onspeechend: SpeechEventHandler; onaudioend: SpeechEventHandler; onend: SpeechEventHandler; start: () => void; stop: () => void; abort: () => void };
type RecognitionConstructor = new () => Recognition;
type CopilotState = { assistance: Assistance | null; preparationRequest: { kind: MatchKind; applicationId: string } | null; completePreparation: (applicationId: string) => void; markSubmitted: (applicationId: string) => void; };
type VoiceSupport = { Constructor: RecognitionConstructor; name: "SpeechRecognition" | "webkitSpeechRecognition" };
type ConversationMode = "discover" | "prepare" | "decision";
type ConversationMessage = { id: number; role: "assistant" | "citizen"; text: string };
type VoiceDiagnostic = { stage: string; timestamp: string; recognizer?: string; language?: string; error?: string; message?: string; detail?: string; secureContext?: boolean; origin?: string; visibilityState?: DocumentVisibilityState; continuous?: boolean; interimResults?: boolean; maxAlternatives?: number };

const CopilotContext = createContext<CopilotState | null>(null);

function voiceSupport(): VoiceSupport | undefined {
  if (typeof window === "undefined") return undefined;
  const browser = window as Window & { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
  if (browser.SpeechRecognition) return { Constructor: browser.SpeechRecognition, name: "SpeechRecognition" };
  if (browser.webkitSpeechRecognition) return { Constructor: browser.webkitSpeechRecognition, name: "webkitSpeechRecognition" };
  return undefined;
}

function voiceError(error?: string, microphoneGranted = false) {
  if ((error === "not-allowed" || error === "service-not-allowed") && microphoneGranted) return "Your microphone is available, but the browser's built-in speech recognition service did not accept this request. You can retry or type your request instead.";
  if (error === "not-allowed" || error === "service-not-allowed") return "Microphone permission was denied. You can allow it in browser settings or type your request instead.";
  if (error === "no-speech") return "We did not hear a request. Please try again or type your request instead.";
  if (error === "audio-capture") return "No microphone was found. Please connect one or type your request instead.";
  if (error === "network") return "Voice recognition is unavailable right now. Check your connection and browser privacy settings, then retry or type your request instead.";
  if (error === "language-not-supported") return "This speech language is not available in the browser. Try English or type your request instead.";
  if (error === "aborted") return "Voice listening was interrupted. Please tap the microphone and try again.";
  return "Voice input could not be completed. Please retry or type your request instead.";
}

function voiceStartError(error: unknown) {
  if (error instanceof DOMException && error.name === "InvalidStateError") return "Voice listening is already active. Please wait a moment and try again.";
  if (error instanceof DOMException && error.name === "NotAllowedError") return "Microphone permission was denied. You can allow it in browser settings or type your request instead.";
  if (error instanceof DOMException && error.name === "SecurityError") return "Voice input is blocked on this website address. Please use localhost or a secure website, or type your request instead.";
  return "Voice input could not be started. Please retry or type your request instead.";
}

function microphonePermissionError(error: unknown) {
  if (error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "SecurityError")) return "Brave did not grant microphone access to JANSEVA-X. Allow microphone access for this local site, then retry or type your request instead.";
  if (error instanceof DOMException && error.name === "NotFoundError") return "No microphone was found. Please connect one or type your request instead.";
  if (error instanceof DOMException && error.name === "NotReadableError") return "Your microphone is busy in another application. Close that application and try again, or type your request instead.";
  return "JANSEVA AI could not access the microphone. Please retry or type your request instead.";
}

function speakAssistant(text: string, onEnd?: () => void) {
  if (typeof window === "undefined" || !("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) { onEnd?.(); return; }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-IN";
  utterance.rate = 0.94;
  utterance.onend = () => onEnd?.();
  utterance.onerror = () => onEnd?.();
  window.speechSynthesis.speak(utterance);
}

function recordVoiceDiagnostic(diagnostic: Omit<VoiceDiagnostic, "timestamp" | "secureContext" | "origin">) {
  if (!import.meta.env.DEV || typeof window === "undefined") return;
  const entry: VoiceDiagnostic = { ...diagnostic, timestamp: new Date().toISOString(), secureContext: window.isSecureContext, origin: window.location.origin, visibilityState: document.visibilityState };
  const target = window as Window & { __jansevaAiVoiceDiagnostics?: VoiceDiagnostic[] };
  target.__jansevaAiVoiceDiagnostics = [...(target.__jansevaAiVoiceDiagnostics ?? []).slice(-19), entry];
  console.info("[JANSEVA AI voice]", entry);
}

export function useCopilot(): CopilotState {
  const context = useContext(CopilotContext);
  if (!context) throw new Error("JANSEVA AI must be used inside its provider.");
  return context;
}

export function CopilotProvider({ children }: { children: React.ReactNode }) {
  const [assistance, setAssistance] = useState<Assistance | null>(null);
  const completePreparation = (applicationId: string) => setAssistance((current) => current?.applicationId === applicationId ? { ...current, preparationRequested: false, preparationComplete: true } : current);
  const markSubmitted = (applicationId: string) => setAssistance((current) => current?.applicationId === applicationId ? { ...current, submitted: true } : current);
  const value = useMemo<CopilotState>(() => ({ assistance, preparationRequest: assistance?.preparationRequested && assistance.applicationId ? { kind: assistance.kind, applicationId: assistance.applicationId } : null, completePreparation, markSubmitted }), [assistance]);
  return <CopilotContext.Provider value={value}><CopilotPanel setAssistance={setAssistance} />{children}</CopilotContext.Provider>;
}

function MicrophoneIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 14a3.5 3.5 0 0 0 3.5-3.5v-5a3.5 3.5 0 0 0-7 0v5A3.5 3.5 0 0 0 12 14Zm6-3.5a1 1 0 1 0-2 0 4 4 0 0 1-8 0 1 1 0 1 0-2 0 6 6 0 0 0 5 5.91V20H8a1 1 0 1 0 0 2h8a1 1 0 1 0 0-2h-3v-3.59A6 6 0 0 0 18 10.5Z" /></svg>; }

function CopilotPanel({ setAssistance }: { setAssistance: React.Dispatch<React.SetStateAction<Assistance | null>> }) {
  const navigate = useNavigate(); const location = useLocation(); const { assistance } = useCopilot();
  const recognition = useRef<Recognition | null>(null); const microphoneStream = useRef<MediaStream | null>(null); const heardResult = useRef(false); const finalTranscript = useRef(""); const latestTranscript = useRef(""); const recognitionFailed = useRef(false); const microphoneGranted = useRef(false); const recognitionRun = useRef(0); const intentionalStop = useRef(false); const openingApplication = useRef(false); const conversationMode = useRef<ConversationMode>("discover"); const conversationViewport = useRef<HTMLDivElement | null>(null); const keepConversationPinned = useRef(true); const messageId = useRef(0); const preparationAnnounced = useRef<string | null>(null); const verificationHandoff = useRef<string | null>(null); const verificationCompletion = useRef<string | null>(null);
  const [open, setOpen] = useState(false); const [query, setQuery] = useState(""); const [transcript, setTranscript] = useState(""); const [language, setLanguage] = useState<"hi-IN" | "en-IN">("hi-IN");
  const [voiceState, setVoiceState] = useState<VoiceState>(() => voiceSupport() ? "idle" : "unsupported");
  const [services, setServices] = useState<Service[]>([]); const [exams, setExams] = useState<Array<Record<string, unknown>>>([]); const [catalogReady, setCatalogReady] = useState(false);
  const [candidate, setCandidate] = useState<CatalogMatch | null>(null); const [loading, setLoading] = useState(false); const [error, setError] = useState(""); const [message, setMessage] = useState(""); const [conversation, setConversation] = useState<ConversationMessage[]>([]);
  const speechAvailable = Boolean(voiceSupport());

  const addMessage = (role: ConversationMessage["role"], text: string) => { if (!text.trim()) return; setConversation((current) => [...current, { id: ++messageId.current, role, text }]); };
  const speak = (text: string, nextMode?: ConversationMode) => { setMessage(text); addMessage("assistant", text); speakAssistant(text, nextMode ? () => { conversationMode.current = nextMode; void startListening(nextMode); } : undefined); };
  useEffect(() => { if (!keepConversationPinned.current) return; const viewport = conversationViewport.current; if (viewport) viewport.scrollTo({ top: viewport.scrollHeight, behavior: "auto" }); }, [conversation]);

  useEffect(() => {
    const applicationId = assistance?.applicationId;
    if (!applicationId || assistance.kind !== "service" || !assistance.preparationComplete) return;
    const applicationPath = `/applications/${applicationId}`;
    const verificationPath = `/applications/${applicationId}/verify`;
    const reviewPath = `/applications/${applicationId}/review`;
    if (location.pathname === applicationPath && verificationHandoff.current !== applicationId) {
      verificationHandoff.current = applicationId;
      navigate(verificationPath);
      speak("I've prepared your application and filled the available identity details. Please complete the face and fingerprint verification.");
      return;
    }
    if (location.pathname !== verificationPath || verificationCompletion.current === applicationId) return;
    let active = true;
    const check = async () => {
      try {
        const result = await citizenApi.application(applicationId);
        if (!active || result.application.status !== "IDENTITY_VERIFIED") return;
        verificationCompletion.current = applicationId;
        navigate(reviewPath);
        speak("Your identity verification is complete. Would you like me to submit the application or save it as a draft?", "decision");
      } catch { /* The verification page remains authoritative if polling is unavailable. */ }
    };
    void check();
    const interval = window.setInterval(() => void check(), 2500);
    return () => { active = false; window.clearInterval(interval); };
  }, [assistance?.applicationId, assistance?.kind, assistance?.preparationComplete, location.pathname, navigate]);

  useEffect(() => {
    void Promise.all([citizenApi.services(), citizenApi.exams()]).then(([serviceResult, examResult]) => { setServices(serviceResult.services); setExams(examResult.exams as Array<Record<string, unknown>>); setCatalogReady(true); }).catch(() => setError("JANSEVA AI could not load supported applications. Please use Services or Government Exams."));
    return () => { recognitionRun.current += 1; recognition.current?.abort(); microphoneStream.current?.getTracks().forEach((track) => track.stop()); microphoneStream.current = null; };
  }, []);

  const discover = (request: string, source: "voice" | "text") => {
    const cleaned = request.trim(); setError(""); setMessage(""); setCandidate(null);
    if (loading) return;
    if (!cleaned) { if (source === "voice") setError("We did not hear a request. Please try again or type your request instead."); return; }
    if (!catalogReady) { setError("Supported applications are still loading. Please wait a moment and try again."); if (source === "voice") setVoiceState("idle"); return; }
    if (source === "voice") setVoiceState("processing");
    const found = matchCopilotIntent(cleaned, services, exams.map((exam) => ({ id: String(exam.id), name: String(exam.name) })));
    if (!found) { const noMatch = "I couldn't identify the exact application yet. You can browse Services or Government Exams."; setMessage(noMatch); addMessage("assistant", noMatch); speakAssistant(noMatch); if (source === "voice") setVoiceState("idle"); return; }
    setCandidate(found); if (source === "voice") setVoiceState("matched"); void openApplication(found);
  };

  const handlePreparationConsent = (request: string) => {
    const normalized = request.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
    if (/^(yes|haan|ha|okay|ok|sure|help|please|yes please|help me)(\s|$)/.test(normalized) || normalized.includes("help me")) { requestPreparation(); return; }
    if (/^(no|not now|later|no thanks)/.test(normalized)) { speak("No problem. Your application is open. You can prepare it whenever you are ready."); conversationMode.current = "discover"; return; }
    speak("Sorry, I didn't catch that. Would you like me to help prepare the application?", "prepare");
  };

  const handleApplicationDecision = (request: string) => {
    const normalized = request.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
    if (/(save|draft|later|keep it)/.test(normalized)) { saveDraft(); return; }
    if (/(submit|send|go ahead|send the application)/.test(normalized)) { submit(); return; }
    speak("Would you like me to submit the application or save it as a draft?", "decision");
  };

  const handleVoiceTranscript = (spoken: string, mode: ConversationMode) => {
    addMessage("citizen", spoken); setTranscript(spoken); setQuery(spoken);
    if (mode === "prepare") handlePreparationConsent(spoken); else if (mode === "decision") handleApplicationDecision(spoken); else discover(spoken, "voice");
  };

  const startListening = async (mode: ConversationMode = "discover") => {
    conversationMode.current = mode;
    const support = voiceSupport(); setError(""); setMessage("");
    if (!support) { recordVoiceDiagnostic({ stage: "unsupported" }); setVoiceState("unsupported"); return; }
    if (!window.isSecureContext) { recordVoiceDiagnostic({ stage: "insecure-origin", recognizer: support.name, language }); setError("Voice input needs a secure website or localhost. You can type your request instead."); setVoiceState("error"); return; }
    if (navigator.permissions?.query) void navigator.permissions.query({ name: "microphone" } as PermissionDescriptor).then((permission) => recordVoiceDiagnostic({ stage: "microphone-permission", recognizer: support.name, language, detail: permission.state })).catch(() => recordVoiceDiagnostic({ stage: "microphone-permission-unavailable", recognizer: support.name, language }));
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        recordVoiceDiagnostic({ stage: "microphone-api-unavailable", recognizer: support.name, language });
        setError("This browser cannot request microphone access for JANSEVA AI. You can type your request instead."); setVoiceState("error"); return;
      }
      microphoneGranted.current = false; microphoneStream.current?.getTracks().forEach((track) => track.stop()); microphoneStream.current = null;
      recordVoiceDiagnostic({ stage: "microphone-requested", recognizer: support.name, language });
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const audioTracks = stream.getAudioTracks();
      microphoneStream.current = stream;
      const track = audioTracks[0];
      microphoneGranted.current = audioTracks.length > 0;
      recordVoiceDiagnostic({ stage: "media-capture-result", recognizer: support.name, language, detail: `succeeded=${audioTracks.length > 0};audioTracks=${audioTracks.length};readyState=${track?.readyState ?? "none"};enabled=${track?.enabled ?? false};temporaryTrackStopped=false` });
      if (!track) { stream.getTracks().forEach((item) => item.stop()); microphoneStream.current = null; setError("No microphone audio track was available. Please connect one or type your request instead."); setVoiceState("error"); return; }
      recordVoiceDiagnostic({ stage: "microphone-granted", recognizer: support.name, language, detail: `readyState=${track.readyState};enabled=${track.enabled};temporaryTrackStopped=false` });
    } catch (caught) {
      microphoneStream.current = null;
      recordVoiceDiagnostic({ stage: "microphone-rejected", recognizer: support.name, language, detail: caught instanceof Error ? `${caught.name}: ${caught.message}` : String(caught) });
      setError(microphonePermissionError(caught)); setVoiceState("error"); return;
    }
    try {
      recognitionRun.current += 1; const run = recognitionRun.current; intentionalStop.current = false;
      if (recognition.current) { recognition.current.onstart = null; recognition.current.onaudiostart = null; recognition.current.onsoundstart = null; recognition.current.onspeechstart = null; recognition.current.onresult = null; recognition.current.onnomatch = null; recognition.current.onerror = null; recognition.current.onspeechend = null; recognition.current.onaudioend = null; recognition.current.onend = null; recognition.current.abort(); }
      const next = new support.Constructor(); recognition.current = next; heardResult.current = false; finalTranscript.current = ""; latestTranscript.current = ""; recognitionFailed.current = false;
      next.lang = language; next.continuous = false; next.interimResults = true; next.maxAlternatives = 1;
      const recognitionConfig = { recognizer: support.name, language, continuous: next.continuous, interimResults: next.interimResults, maxAlternatives: next.maxAlternatives };
      recordVoiceDiagnostic({ stage: "recognizer-constructed", ...recognitionConfig });
      recordVoiceDiagnostic({ stage: "start-requested", ...recognitionConfig }); setVoiceState("listening");
      next.onstart = () => { if (recognitionRun.current !== run) return; recordVoiceDiagnostic({ stage: "start", ...recognitionConfig }); setVoiceState("listening"); };
      next.onaudiostart = () => { if (recognitionRun.current === run) recordVoiceDiagnostic({ stage: "audiostart", ...recognitionConfig, detail: microphoneStream.current ? `track=${microphoneStream.current.getAudioTracks()[0]?.readyState ?? "none"};enabled=${microphoneStream.current.getAudioTracks()[0]?.enabled ?? false}` : "track=none" }); };
      next.onsoundstart = () => { if (recognitionRun.current === run) recordVoiceDiagnostic({ stage: "soundstart", ...recognitionConfig }); };
      next.onspeechstart = () => { if (recognitionRun.current === run) recordVoiceDiagnostic({ stage: "speechstart", ...recognitionConfig }); };
      next.onresult = (event) => {
        if (recognitionRun.current !== run) return;
        const finalWords: string[] = []; const interimWords: string[] = [];
        for (let index = event.resultIndex ?? 0; index < event.results.length; index += 1) { const result = event.results[index]; const text = result[0]?.transcript ?? ""; if (result.isFinal) finalWords.push(text); else interimWords.push(text); }
        const finalText = finalWords.join(" ").trim(); const interimText = interimWords.join(" ").trim();
        if (finalText) finalTranscript.current = `${finalTranscript.current} ${finalText}`.trim();
        const visibleText = (finalTranscript.current || interimText).trim();
        recordVoiceDiagnostic({ stage: "result", ...recognitionConfig, detail: `final=${Boolean(finalText)};finalChars=${finalTranscript.current.length};interimChars=${interimText.length};empty=${visibleText.length === 0}` });
        if (!visibleText) return;
        latestTranscript.current = visibleText; setTranscript(visibleText); setQuery(visibleText);
        if (!finalTranscript.current || heardResult.current) return;
        heardResult.current = true; setVoiceState("recognized"); const spoken = finalTranscript.current;
        window.setTimeout(() => { if (recognitionRun.current === run) handleVoiceTranscript(spoken, mode); }, 180);
      };
      next.onnomatch = () => { if (recognitionRun.current === run) recordVoiceDiagnostic({ stage: "nomatch", ...recognitionConfig }); };
      next.onerror = (event) => {
        if (recognitionRun.current !== run) return;
        recognitionFailed.current = true; recordVoiceDiagnostic({ stage: "error", ...recognitionConfig, error: event.error, message: event.message, detail: event.message ?? "" });
        if (event.error === "aborted" && intentionalStop.current) { setVoiceState("idle"); return; }
        if (event.error === "language-not-supported" && language === "hi-IN") setLanguage("en-IN");
        setError(voiceError(event.error, microphoneGranted.current)); setVoiceState("error");
      };
      next.onspeechend = () => { if (recognitionRun.current === run) recordVoiceDiagnostic({ stage: "speechend", ...recognitionConfig }); };
      next.onaudioend = () => { if (recognitionRun.current === run) recordVoiceDiagnostic({ stage: "audioend", ...recognitionConfig }); };
      next.onend = () => {
        if (recognitionRun.current !== run) return;
        const track = microphoneStream.current?.getAudioTracks()[0];
        recordVoiceDiagnostic({ stage: "end", ...recognitionConfig, detail: `${heardResult.current ? "result-received" : intentionalStop.current ? "stopped-by-user" : "ended-without-result"};track=${track?.readyState ?? "none"};enabled=${track?.enabled ?? false};temporaryTrackStopped=${track ? track.readyState === "ended" : true}` });
        microphoneStream.current?.getTracks().forEach((item) => item.stop()); microphoneStream.current = null;
        if (recognitionFailed.current) return;
        if (!heardResult.current && latestTranscript.current.trim()) {
          heardResult.current = true; const spoken = latestTranscript.current.trim(); setVoiceState("recognized"); window.setTimeout(() => { if (recognitionRun.current === run) handleVoiceTranscript(spoken, mode); }, 180); return;
        }
        if (intentionalStop.current || heardResult.current) { setVoiceState((current) => current === "listening" ? "idle" : current); return; }
        setError("We did not hear a request. Please try again or type your request instead."); setVoiceState("error");
      };
      next.start();
    } catch (caught) { microphoneStream.current?.getTracks().forEach((track) => track.stop()); microphoneStream.current = null; recordVoiceDiagnostic({ stage: "start-exception", recognizer: support.name, language, detail: caught instanceof Error ? `${caught.name}: ${caught.message}` : String(caught) }); setError(voiceStartError(caught)); setVoiceState("error"); }
  };

  const stopListening = () => { intentionalStop.current = true; recognition.current?.stop(); };
  const openApplication = async (match: CatalogMatch) => {
    if (openingApplication.current) return;
    openingApplication.current = true;
    setLoading(true); setError(""); setMessage("Opening your application...");
    try {
      if (match.kind === "exam") { const result = await citizenApi.createExamApplication(match.id); const application = result.application as { id: string }; setAssistance({ ...match, applicationId: application.id, preparationRequested: false }); navigate(`/exam-applications/${application.id}`); }
      else { const result = await citizenApi.createApplication(match.id); setAssistance({ ...match, applicationId: result.application.applicationId, preparationRequested: false }); navigate(`/applications/${result.application.applicationId}`); }
      setCandidate(null); setOpen(true); setVoiceState("matched");
      speak(match.kind === "exam" ? `I found your ${match.name} application. Would you like me to help prepare it?` : `I found your ${match.name} application. Would you like me to help prepare it using Smart Fill and your available documents?`, "prepare");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "The application could not be opened. Please try again."); } finally { openingApplication.current = false; setLoading(false); }
  };
  const requestPreparation = () => {
    const applicationId = assistance?.applicationId;
    if (!applicationId || assistance.preparationRequested || assistance.preparationComplete) return;
    setAssistance((current) => current?.applicationId === applicationId ? { ...current, preparationRequested: true } : current);
    speak("Preparing your application with Smart Fill and matching available documents.");
  };
  const saveDraft = async () => {
    if (!assistance?.applicationId || loading) return;
    setLoading(true); setMessage("Saving draft...");
    const onComplete = (success: boolean, detail?: string) => {
      setLoading(false);
      if (!success) { setError(detail || "The application could not be saved as a draft."); return; }
      setAssistance((current) => current ? { ...current, draftSaved: true } : current); speak("Your application has been saved as a draft. You can continue it later.");
    };
    window.dispatchEvent(new CustomEvent(assistance.kind === "exam" ? "janseva-ai-exam-save-draft" : "janseva-ai-save-draft", { detail: { applicationId: assistance.applicationId, onComplete } }));
    window.setTimeout(() => setLoading(false), 8000);
  };
  const continueToVerification = () => assistance?.applicationId && navigate(`/applications/${assistance.applicationId}/verify`);
  const openReview = async () => {
    if (!assistance?.applicationId) return; setLoading(true); setError("");
    try { const result = await citizenApi.application(assistance.applicationId); if (result.application.status !== "IDENTITY_VERIFIED") { setError("Please complete the existing demo identity verification first. JANSEVA AI will then open the final review."); return; } navigate(`/applications/${assistance.applicationId}/review`); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Application status could not be checked."); } finally { setLoading(false); }
  };
  const submit = async () => {
    if (!assistance?.applicationId) return; setLoading(true); setError("");
    try { const result = await citizenApi.submit(assistance.applicationId, crypto.randomUUID()); setAssistance((current) => current ? { ...current, submitted: true } : current); navigate(`/submitted/${result.applicationId}`); speak(`${result.service.name} has been submitted successfully. Is there anything else I can help you with?`); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "The application could not be submitted. Please review the existing application details and try again."); } finally { setLoading(false); }
  };
  const isGeneric = assistance?.kind === "service"; const isReview = isGeneric && assistance?.applicationId && location.pathname === `/applications/${assistance.applicationId}/review`; const isSubmitted = Boolean(assistance?.submitted);
  const openExamReview = () => assistance?.applicationId && window.dispatchEvent(new CustomEvent("janseva-ai-exam-review", { detail: { applicationId: assistance.applicationId } }));
  const submitExam = () => assistance?.applicationId && window.dispatchEvent(new CustomEvent("janseva-ai-exam-submit", { detail: { applicationId: assistance.applicationId, onComplete: (success: boolean, detail?: string) => { if (success) speak("Your application has been submitted successfully. Is there anything else I can help you with?"); else setError(detail || "The application could not be submitted."); } } }));
  useEffect(() => {
    const readyForDecision = assistance?.kind === "exam" || (assistance?.kind === "service" && isReview);
    if (!assistance?.applicationId || !assistance.preparationComplete || !readyForDecision || assistance.submitted || preparationAnnounced.current === assistance.applicationId) return;
    preparationAnnounced.current = assistance.applicationId;
    speak("Your application is ready. Would you like me to submit it or save it as a draft?", "decision");
  }, [assistance?.applicationId, assistance?.preparationComplete, assistance?.submitted, location.pathname, isReview]);

  const submitText = () => {
    const cleaned = query.trim(); if (!cleaned) return;
    addMessage("citizen", cleaned); setTranscript(cleaned);
    if (assistance?.preparationComplete && !assistance.submitted) handleApplicationDecision(cleaned);
    else if (assistance && !assistance.preparationRequested) handlePreparationConsent(cleaned);
    else discover(cleaned, "text");
    setQuery("");
  };
  const resetAssistant = () => { setAssistance(null); setCandidate(null); setQuery(""); setTranscript(""); setMessage(""); setConversation([]); preparationAnnounced.current = null; conversationMode.current = "discover"; setVoiceState(speechAvailable ? "idle" : "unsupported"); };
  const decisionReady = Boolean(assistance?.preparationComplete && !assistance.submitted && !assistance.draftSaved && (assistance.kind === "exam" || isReview));
  return <aside className={`copilot ${open ? "open" : ""}`} aria-label="JANSEVA AI government application assistant">
    <button className="copilot-launch" type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open}><span className="copilot-launch-icon"><MicrophoneIcon /></span><span><strong>JANSEVA AI</strong><small>Your Government Application Assistant</small></span></button>
    {open && <section className="copilot-panel" aria-live="polite"><header><p className="eyebrow">JANSEVA AI</p><h2>Your Government Application Assistant</h2><p>Speak naturally and I will help you complete the existing application.</p></header>
      <div className="copilot-conversation" ref={conversationViewport} onScroll={(event) => { const element = event.currentTarget; keepConversationPinned.current = element.scrollHeight - element.scrollTop - element.clientHeight < 48; }}>
        {!conversation.length && <p className="copilot-empty-state">How can we help you? Tap the microphone and tell us what you need.</p>}
        {conversation.map((item) => <div className={`copilot-message ${item.role}`} key={item.id}><span>{item.role === "citizen" ? "You" : "JANSEVA AI"}</span><p>{item.text}</p></div>)}
        {loading && <Loading label={message || "Working on your application"} />}
        {error && <ErrorMessage message={error} />}
        {voiceState === "unsupported" && <section className="copilot-notice"><strong>Voice input is not supported in this browser.</strong><p>You can type your request instead.</p></section>}
        {voiceState === "error" && <button className="button secondary" type="button" onClick={() => void startListening(conversationMode.current)}>Retry voice input</button>}
        {transcript && <section className="copilot-transcript"><span>I heard:</span><strong>{transcript}</strong></section>}
        {message && !assistance && !loading && <div className="copilot-discovery"><p>{message}</p><div className="inline-actions"><button className="button secondary" type="button" onClick={() => navigate("/services")}>Browse Services</button><button className="button secondary" type="button" onClick={() => navigate("/exams")}>Browse Government Exams</button></div></div>}
        {assistance && <section className="copilot-result"><span className="copilot-result-label">CURRENT APPLICATION</span><strong>{assistance.name}</strong>{assistance.preparationRequested && !assistance.preparationComplete && <p>Your available demo information and matching documents are being used only with your permission.</p>}{assistance.preparationComplete && !assistance.submitted && !assistance.draftSaved && <><SuccessMessage message="Smart Fill and matching document preparation is complete." /><p>Only genuinely missing information remains for your review.</p></>}{assistance.draftSaved && <SuccessMessage message="Your application has been saved as a draft. You can continue it later." />}{assistance.submitted && <><SuccessMessage message="Your application has been submitted successfully. Live tracking is available on the existing application page." /><p className="copilot-question">Is there anything else I can help you with?</p></>}</section>}
      </div>
      <div className="copilot-controls">
        <section className="copilot-voice" aria-label="Voice request"><button className={`copilot-microphone ${voiceState === "listening" ? "listening" : ""}`} type="button" onClick={voiceState === "listening" ? stopListening : () => void startListening(assistance ? conversationMode.current : "discover")} disabled={loading || (!catalogReady && !assistance)} aria-label={voiceState === "listening" ? "Stop listening" : "Tap to speak"}><MicrophoneIcon /></button><strong>{voiceState === "listening" ? "Listening..." : assistance ? "Tap to answer" : catalogReady ? "Tap to speak" : "Preparing assistant..."}</strong><p>{voiceState === "listening" ? "Speak your answer clearly." : assistance ? "You can answer by voice or type below." : catalogReady ? "You can speak in Hindi, Hinglish, or English." : "Loading supported applications."}</p><div className="copilot-language" aria-label="Speech language"><button className={language === "hi-IN" ? "active" : ""} type="button" onClick={() => setLanguage("hi-IN")}>Hindi / Hinglish</button><button className={language === "en-IN" ? "active" : ""} type="button" onClick={() => setLanguage("en-IN")}>English</button></div></section>
        {assistance && !assistance.preparationRequested && !assistance.preparationComplete && <div className="inline-actions"><button className="button primary" type="button" onClick={requestPreparation}>Yes, help prepare</button><button className="button secondary" type="button" onClick={() => speak("No problem. Your application is open whenever you are ready.")}>Not now</button></div>}
        {assistance?.preparationComplete && !assistance.submitted && !assistance.draftSaved && !decisionReady && assistance.kind === "service" && <button className="button primary" type="button" onClick={location.pathname.endsWith("/verify") ? () => void openReview() : continueToVerification} disabled={loading}>{location.pathname.endsWith("/verify") ? "Open final review" : "Continue identity verification"}</button>}
        {assistance?.preparationComplete && !assistance.submitted && !assistance.draftSaved && assistance.kind === "exam" && !decisionReady && <button className="button secondary" type="button" onClick={openExamReview}>Review the application</button>}
        {decisionReady && assistance && <div className="inline-actions"><button className="button primary" type="button" onClick={assistance.kind === "exam" ? submitExam : () => void submit()} disabled={loading}>Submit application</button><button className="button secondary" type="button" onClick={() => void saveDraft()} disabled={loading}>Save as draft</button></div>}
        {assistance?.submitted && <button className="button secondary" type="button" onClick={resetAssistant}>Help with another task</button>}
        <div className="copilot-type-divider"><span>Type a request or answer</span></div><label className="copilot-input"><span className="sr-only">Your request or answer</span><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") submitText(); }} placeholder={assistance ? "Type yes, submit, or save as draft" : "For example: I want to apply for SSC CGL"} /></label><button className="button secondary" type="button" onClick={submitText}>Send</button>
      </div>
    </section>}
  </aside>;
}
