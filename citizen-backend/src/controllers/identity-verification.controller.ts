import type { Request, Response } from "express";
import type { FingerprintStep } from "@prisma/client";
import { IdentityVerificationService } from "../services/identity-verification.service";

const service = new IdentityVerificationService();
const applicationId = (request: Request) => (request.validated!.params as { applicationId: string }).applicationId;

export async function verifyAadhaar(request: Request, response: Response) { response.status(200).json({ success: true, data: await service.verifyAadhaar(request.auth!.userId, applicationId(request), (request.validated!.body as { aadhaar: string }).aadhaar) }); }
export async function verifyPan(request: Request, response: Response) { response.status(200).json({ success: true, data: await service.verifyPan(request.auth!.userId, applicationId(request), (request.validated!.body as { pan: string }).pan) }); }
export async function startFace(request: Request, response: Response) { response.status(200).json({ success: true, data: await service.startFace(request.auth!.userId, applicationId(request)) }); }
export async function completeFace(request: Request, response: Response) { response.status(200).json({ success: true, data: await service.completeFace(request.auth!.userId, (request.validated!.params as { verificationId: string }).verificationId) }); }
export async function startFingerprint(request: Request, response: Response) { response.status(200).json({ success: true, data: await service.startFingerprint(request.auth!.userId, applicationId(request)) }); }
export async function pairFingerprint(request: Request, response: Response) { response.status(200).json({ success: true, data: await service.pairFingerprint(request.auth!.userId, (request.validated!.params as { sessionId: string }).sessionId, (request.validated!.body as { pairingChallenge: string }).pairingChallenge) }); }
export async function completeFingerprintStep(request: Request, response: Response) { response.status(200).json({ success: true, data: await service.completeFingerprintStep(request.auth!.userId, (request.validated!.params as { sessionId: string; step: FingerprintStep }).sessionId, (request.validated!.params as { step: FingerprintStep }).step) }); }
export async function fingerprintStatus(request: Request, response: Response) { response.status(200).json({ success: true, data: await service.fingerprintStatus(request.auth!.userId, (request.validated!.params as { sessionId: string }).sessionId) }); }
export async function completeEkyc(request: Request, response: Response) { response.status(200).json({ success: true, data: await service.completeEkyc(request.auth!.userId, applicationId(request)) }); }
export async function verificationSummary(request: Request, response: Response) { response.status(200).json({ success: true, data: await service.summary(request.auth!.userId, applicationId(request)) }); }
