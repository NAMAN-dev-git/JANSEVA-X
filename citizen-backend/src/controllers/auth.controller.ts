import type { Request, Response } from "express";
import { AuthService } from "../services/auth.service";
import type { LoginRequestBody, RefreshRequestBody, RegisterRequestBody } from "../validators/auth.validators";

const authService = new AuthService();

function bodyAs<T>(request: Request): T {
  return request.validated?.body as T;
}

export async function register(request: Request, response: Response): Promise<void> {
  const result = await authService.register(bodyAs<RegisterRequestBody>(request));
  response.status(201).json({ success: true, data: result });
}

export async function login(request: Request, response: Response): Promise<void> {
  const { email, password } = bodyAs<LoginRequestBody>(request);
  const result = await authService.login(email, password);
  response.status(200).json({ success: true, data: result });
}

export async function refresh(request: Request, response: Response): Promise<void> {
  const { refreshToken } = bodyAs<RefreshRequestBody>(request);
  const tokens = await authService.refresh(refreshToken);
  response.status(200).json({ success: true, data: { tokens } });
}

export async function logout(request: Request, response: Response): Promise<void> {
  const { refreshToken } = bodyAs<RefreshRequestBody>(request);
  await authService.logout(refreshToken);
  response.status(204).send();
}

export async function me(request: Request, response: Response): Promise<void> {
  const user = await authService.getCurrentUser(request.auth!.userId);
  response.status(200).json({ success: true, data: { user } });
}
