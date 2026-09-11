import { createHash, randomBytes } from "crypto";
import type { CitizenProfile, User } from "@prisma/client";
import { env } from "../config/env";
import {
  type AuthRepository,
  type CitizenProfileUpdateInput,
  type RegisterCitizenInput,
  PrismaAuthRepository,
  type UserWithCitizenProfile,
} from "../repositories/auth.repository";
import { AppError } from "../utils/app-error";
import { signAccessToken } from "../utils/jwt";
import { hashPassword, verifyPassword } from "../utils/password";

export type RegistrationInput = Omit<RegisterCitizenInput, "passwordHash"> & { password: string };

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  tokenType: "Bearer";
  expiresIn: string;
}

export interface PublicUser {
  userId: string;
  email: string;
  role: User["role"];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  citizenProfile: CitizenProfile | null;
}

export class AuthService {
  constructor(private readonly repository: AuthRepository = new PrismaAuthRepository()) {}

  async register(input: RegistrationInput): Promise<{ user: PublicUser; tokens: TokenPair }> {
    const email = normalizeEmail(input.email);
    const existingUser = await this.repository.findUserByEmail(email);
    if (existingUser) {
      throw new AppError("An account with this email already exists", 409);
    }

    const passwordHash = await hashPassword(input.password);
    const user = await this.repository.createCitizenUser({ ...input, email, passwordHash });
    return { user: toPublicUser(user), tokens: await this.createTokenPair(user) };
  }

  async login(emailInput: string, password: string): Promise<{ user: PublicUser; tokens: TokenPair }> {
    const user = await this.repository.findUserByEmail(normalizeEmail(emailInput));
    const invalidCredentials = new AppError("Invalid email or password", 401);

    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      throw invalidCredentials;
    }
    if (!user.isActive) {
      throw new AppError("This account is inactive", 403);
    }

    await this.repository.updateLastLogin(user.id);
    return { user: toPublicUser(user), tokens: await this.createTokenPair(user) };
  }

  async refresh(rawRefreshToken: string): Promise<TokenPair> {
    const storedToken = await this.repository.findRefreshTokenByHash(hashRefreshToken(rawRefreshToken));
    const now = new Date();

    if (!storedToken || storedToken.revokedAt || storedToken.expiresAt <= now || !storedToken.user.isActive) {
      throw new AppError("Invalid refresh token", 401);
    }

    const revoked = await this.repository.revokeRefreshTokenIfActive(storedToken.id, now);
    if (!revoked) {
      throw new AppError("Invalid refresh token", 401);
    }

    return this.createTokenPair(storedToken.user);
  }

  async logout(rawRefreshToken: string): Promise<void> {
    const storedToken = await this.repository.findRefreshTokenByHash(hashRefreshToken(rawRefreshToken));
    if (storedToken) {
      await this.repository.revokeRefreshTokenIfActive(storedToken.id, new Date());
    }
  }

  async getCurrentUser(userId: string): Promise<PublicUser> {
    const user = await this.repository.findUserById(userId);
    if (!user || !user.isActive) {
      throw new AppError("Authentication required", 401);
    }
    return toPublicUser(user);
  }

  async getCitizenProfile(userId: string): Promise<CitizenProfile> {
    const profile = await this.repository.findCitizenProfileByUserId(userId);
    if (!profile) {
      throw new AppError("Citizen profile not found", 404);
    }
    return profile;
  }

  async updateCitizenProfile(userId: string, input: CitizenProfileUpdateInput): Promise<CitizenProfile> {
    const profile = await this.getCitizenProfile(userId);
    return this.repository.updateCitizenProfile(profile.id, input);
  }

  private async createTokenPair(user: Pick<User, "id" | "role">): Promise<TokenPair> {
    const refreshToken = randomBytes(48).toString("base64url");
    const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_EXPIRES_IN_DAYS * 24 * 60 * 60 * 1000);
    await this.repository.createRefreshToken({ userId: user.id, tokenHash: hashRefreshToken(refreshToken), expiresAt });

    return {
      accessToken: signAccessToken({ userId: user.id, role: user.role }),
      refreshToken,
      tokenType: "Bearer",
      expiresIn: env.JWT_EXPIRES_IN,
    };
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function hashRefreshToken(refreshToken: string): string {
  return createHash("sha256").update(refreshToken).digest("hex");
}

function toPublicUser(user: UserWithCitizenProfile): PublicUser {
  return {
    userId: user.id,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    citizenProfile: user.citizenProfile,
  };
}
