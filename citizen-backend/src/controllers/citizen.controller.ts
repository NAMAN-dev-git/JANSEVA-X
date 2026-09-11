import type { Request, Response } from "express";
import { AuthService } from "../services/auth.service";
import type { UpdateProfileRequestBody } from "../validators/auth.validators";

const authService = new AuthService();

export async function getProfile(request: Request, response: Response): Promise<void> {
  const profile = await authService.getCitizenProfile(request.auth!.userId);
  response.status(200).json({ success: true, data: { profile } });
}

export async function updateProfile(request: Request, response: Response): Promise<void> {
  const profile = await authService.updateCitizenProfile(request.auth!.userId, request.validated?.body as UpdateProfileRequestBody);
  response.status(200).json({ success: true, data: { profile } });
}
