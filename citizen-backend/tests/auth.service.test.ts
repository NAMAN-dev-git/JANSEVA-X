import { randomUUID } from "crypto";
import type { CitizenProfile, RefreshToken, User } from "@prisma/client";
import { beforeEach, describe, expect, it } from "vitest";
import {
  type AuthRepository,
  type CitizenProfileUpdateInput,
  type RefreshTokenWithUser,
  type RegisterCitizenInput,
  type UserWithCitizenProfile,
} from "../src/repositories/auth.repository";
import { AuthService, hashRefreshToken } from "../src/services/auth.service";
import { hashPassword } from "../src/utils/password";

class MemoryAuthRepository implements AuthRepository {
  private readonly users = new Map<string, UserWithCitizenProfile>();
  private readonly profiles = new Map<string, CitizenProfile>();
  private readonly refreshTokens = new Map<string, RefreshTokenWithUser>();

  async addCitizen(email: string, password: string, isActive = true): Promise<UserWithCitizenProfile> {
    const user = await this.createCitizenUser({
      email,
      passwordHash: await hashPassword(password),
      fullName: "Demo Citizen",
    });
    user.isActive = isActive;
    return user;
  }

  async findUserByEmail(email: string): Promise<UserWithCitizenProfile | null> {
    return this.users.get(email) ?? null;
  }

  async findUserById(userId: string): Promise<UserWithCitizenProfile | null> {
    return [...this.users.values()].find((user) => user.id === userId) ?? null;
  }

  async createCitizenUser(input: RegisterCitizenInput): Promise<UserWithCitizenProfile> {
    const now = new Date();
    const userId = randomUUID();
    const profile: CitizenProfile = {
      id: randomUUID(),
      userId,
      fullName: input.fullName,
      phone: input.phone ?? null,
      dateOfBirth: input.dateOfBirth ?? null,
      address: input.address ?? null,
      city: input.city ?? null,
      state: input.state ?? null,
      pincode: input.pincode ?? null,
      createdAt: now,
      updatedAt: now,
    };
    const user = {
      id: userId,
      email: input.email,
      passwordHash: input.passwordHash,
      role: "CITIZEN",
      displayName: null,
      isActive: true,
      lastLoginAt: null,
      createdAt: now,
      updatedAt: now,
      citizenProfile: profile,
    } as UserWithCitizenProfile;
    this.users.set(user.email, user);
    this.profiles.set(profile.id, profile);
    return user;
  }

  async updateLastLogin(userId: string): Promise<void> {
    const user = await this.findUserById(userId);
    if (user) user.lastLoginAt = new Date();
  }

  async findCitizenProfileByUserId(userId: string): Promise<CitizenProfile | null> {
    return [...this.profiles.values()].find((profile) => profile.userId === userId) ?? null;
  }

  async updateCitizenProfile(citizenId: string, input: CitizenProfileUpdateInput): Promise<CitizenProfile> {
    const profile = this.profiles.get(citizenId);
    if (!profile) throw new Error("Profile not found");
    Object.assign(profile, input, { updatedAt: new Date() });
    return profile;
  }

  async createRefreshToken(input: { tokenHash: string; userId: string; expiresAt: Date }): Promise<RefreshToken> {
    const user = await this.findUserById(input.userId);
    if (!user) throw new Error("User not found");
    const token = {
      id: randomUUID(),
      ...input,
      revokedAt: null,
      createdAt: new Date(),
      user: { id: user.id, role: user.role, isActive: user.isActive },
    } as RefreshTokenWithUser;
    this.refreshTokens.set(input.tokenHash, token);
    return token;
  }

  async findRefreshTokenByHash(tokenHash: string): Promise<RefreshTokenWithUser | null> {
    return this.refreshTokens.get(tokenHash) ?? null;
  }

  async revokeRefreshTokenIfActive(refreshTokenId: string, revokedAt: Date): Promise<boolean> {
    const token = [...this.refreshTokens.values()].find((item) => item.id === refreshTokenId);
    if (!token || token.revokedAt || token.expiresAt <= revokedAt) return false;
    token.revokedAt = revokedAt;
    return true;
  }

  expire(rawRefreshToken: string): void {
    const token = this.refreshTokens.get(hashRefreshToken(rawRefreshToken));
    if (token) token.expiresAt = new Date(Date.now() - 1);
  }

  getRefreshToken(rawRefreshToken: string): RefreshTokenWithUser | undefined {
    return this.refreshTokens.get(hashRefreshToken(rawRefreshToken));
  }
}

describe("AuthService", () => {
  let repository: MemoryAuthRepository;
  let service: AuthService;

  beforeEach(() => {
    repository = new MemoryAuthRepository();
    service = new AuthService(repository);
  });

  it("registers a citizen with a public response and hashed password", async () => {
    const result = await service.register({ email: " NEW.CITIZEN@JANSEVAX.TEST ", password: "StrongPassword123!", fullName: "New Citizen", phone: "+91 99999 99999" });

    expect(result.user).toMatchObject({ email: "new.citizen@jansevax.test", role: "CITIZEN" });
    expect(result.user).not.toHaveProperty("passwordHash");
    expect(result.tokens.accessToken).toBeTruthy();
    expect(repository.getRefreshToken(result.tokens.refreshToken)?.tokenHash).not.toBe(result.tokens.refreshToken);
  });

  it("rejects duplicate email registration", async () => {
    await repository.addCitizen("duplicate@jansevax.test", "StrongPassword123!");
    await expect(service.register({ email: "duplicate@jansevax.test", password: "StrongPassword123!", fullName: "Duplicate" })).rejects.toMatchObject({ statusCode: 409 });
  });

  it("logs in an active user and rejects wrong or nonexistent credentials", async () => {
    await repository.addCitizen("citizen@jansevax.test", "StrongPassword123!");
    const login = await service.login("CITIZEN@JANSEVAX.TEST", "StrongPassword123!");

    expect(login.tokens.refreshToken).toBeTruthy();
    await expect(service.login("citizen@jansevax.test", "wrong-password")).rejects.toMatchObject({ statusCode: 401 });
    await expect(service.login("missing@jansevax.test", "wrong-password")).rejects.toMatchObject({ statusCode: 401 });
  });

  it("rejects an inactive user at login", async () => {
    await repository.addCitizen("inactive@jansevax.test", "StrongPassword123!", false);
    await expect(service.login("inactive@jansevax.test", "StrongPassword123!")).rejects.toMatchObject({ statusCode: 403 });
  });

  it("rotates a valid refresh token", async () => {
    await repository.addCitizen("refresh@jansevax.test", "StrongPassword123!");
    const login = await service.login("refresh@jansevax.test", "StrongPassword123!");
    const rotated = await service.refresh(login.tokens.refreshToken);

    expect(rotated.refreshToken).not.toBe(login.tokens.refreshToken);
    expect(repository.getRefreshToken(login.tokens.refreshToken)?.revokedAt).not.toBeNull();
    await expect(service.refresh(login.tokens.refreshToken)).rejects.toMatchObject({ statusCode: 401 });
  });

  it("rejects expired and revoked refresh tokens", async () => {
    await repository.addCitizen("token-state@jansevax.test", "StrongPassword123!");
    const expiredLogin = await service.login("token-state@jansevax.test", "StrongPassword123!");
    repository.expire(expiredLogin.tokens.refreshToken);
    await expect(service.refresh(expiredLogin.tokens.refreshToken)).rejects.toMatchObject({ statusCode: 401 });

    const activeLogin = await service.login("token-state@jansevax.test", "StrongPassword123!");
    await service.logout(activeLogin.tokens.refreshToken);
    expect(repository.getRefreshToken(activeLogin.tokens.refreshToken)?.revokedAt).not.toBeNull();
    await expect(service.refresh(activeLogin.tokens.refreshToken)).rejects.toMatchObject({ statusCode: 401 });
  });

  it("returns and updates only the authenticated citizen profile", async () => {
    const firstUser = await repository.addCitizen("first@jansevax.test", "StrongPassword123!");
    const secondUser = await repository.addCitizen("second@jansevax.test", "StrongPassword123!");
    const profile = await service.getCitizenProfile(firstUser.id);
    const updated = await service.updateCitizenProfile(firstUser.id, { fullName: "Updated Citizen", city: "Demo City" });

    expect(profile.id).toBe(firstUser.citizenProfile!.id);
    expect(updated).toMatchObject({ fullName: "Updated Citizen", city: "Demo City" });
    expect((await service.getCitizenProfile(secondUser.id)).fullName).toBe("Demo Citizen");
  });
});
