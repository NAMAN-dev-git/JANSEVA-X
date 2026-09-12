import { createHash } from "crypto";

export const DEMO_MODE = "DEMO" as const;

function reference(prefix: string, seed: string): string {
  return `DEMO-${prefix}-${createHash("sha256").update(seed).digest("hex").slice(0, 16).toUpperCase()}`;
}

export class MockAadhaarProvider {
  verify(input: { applicationId: string; aadhaar: string }) {
    const digits = input.aadhaar.replace(/\D/g, "");
    const lastFour = digits.length >= 4 ? digits.slice(-4) : input.aadhaar.slice(-4);
    return { maskedAadhaar: `XXXX-XXXX-${lastFour}`, referenceId: reference("AADHAAR", `${input.applicationId}:${lastFour}`), provider: "MOCK_AADHAAR" };
  }
}

export class MockPanProvider {
  verify(input: { applicationId: string; pan: string }) {
    const normalized = input.pan.toUpperCase();
    return { maskedPan: `${normalized.slice(0, 5)}****${normalized.slice(-1)}`, taxpayerName: "DEMO CITIZEN", entityType: "INDIVIDUAL", referenceId: reference("PAN", `${input.applicationId}:${normalized}`), provider: "MOCK_PAN" };
  }
}

export class MockFaceVerificationProvider {
  complete(input: { verificationId: string }) {
    return { matchResult: "MATCH", livenessResult: "PASSED", confidence: 0.97, confidenceMode: "DEMO/SIMULATED", referenceId: reference("FACE", input.verificationId), provider: "MOCK_FACE" };
  }
}

export class MockFingerprintProvider {
  complete(input: { verificationId: string }) {
    return { result: "SEQUENCE_COMPLETED", referenceId: reference("FINGERPRINT", input.verificationId), provider: "MOCK_FINGERPRINT", limitation: "DEMO QR sequence only; no physical fingerprint was captured or verified." };
  }
}

export class MockEkycProvider {
  complete(input: { applicationId: string }) {
    return { referenceId: reference("EKYC", input.applicationId), documentReference: reference("KYC-DOC", input.applicationId), provider: "MOCK_EKYC" };
  }
}
