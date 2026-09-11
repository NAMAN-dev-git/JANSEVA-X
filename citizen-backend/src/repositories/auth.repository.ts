import { Prisma, type CitizenProfile, type RefreshToken, type User } from "@prisma/client";
import { prisma } from "../lib/prisma";

export type UserWithCitizenProfile = Prisma.UserGetPayload<{ include: { citizenProfile: true } }>;
export type RefreshTokenWithUser = Prisma.RefreshTokenGetPayload<{
  include: { user: { select: { id: true; role: true; isActive: true } } };
}>;

export interface RegisterCitizenInput {
  email: string;
  passwordHash: string;
  fullName: string;
  phone?: string;
  dateOfBirth?: Date;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
}

export interface CitizenProfileUpdateInput {
  fullName?: string;
  phone?: string;
  dateOfBirth?: Date;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
}

export interface AuthRepository {
  findUserByEmail(email: string): Promise<UserWithCitizenProfile | null>;
  findUserById(userId: string): Promise<UserWithCitizenProfile | null>;
  createCitizenUser(input: RegisterCitizenInput): Promise<UserWithCitizenProfile>;
  updateLastLogin(userId: string): Promise<void>;
  findCitizenProfileByUserId(userId: string): Promise<CitizenProfile | null>;
  updateCitizenProfile(citizenId: string, input: CitizenProfileUpdateInput): Promise<CitizenProfile>;
  createRefreshToken(input: { tokenHash: string; userId: string; expiresAt: Date }): Promise<RefreshToken>;
  findRefreshTokenByHash(tokenHash: string): Promise<RefreshTokenWithUser | null>;
  revokeRefreshTokenIfActive(refreshTokenId: string, revokedAt: Date): Promise<boolean>;
}

export class PrismaAuthRepository implements AuthRepository {
  findUserByEmail(email: string): Promise<UserWithCitizenProfile | null> {
    return prisma.user.findUnique({ where: { email }, include: { citizenProfile: true } });
  }

  findUserById(userId: string): Promise<UserWithCitizenProfile | null> {
    return prisma.user.findUnique({ where: { id: userId }, include: { citizenProfile: true } });
  }

  createCitizenUser(input: RegisterCitizenInput): Promise<UserWithCitizenProfile> {
    const { fullName, phone, dateOfBirth, address, city, state, pincode, ...user } = input;
    return prisma.user.create({
      data: {
        ...user,
        role: "CITIZEN",
        citizenProfile: { create: { fullName, phone, dateOfBirth, address, city, state, pincode } },
      },
      include: { citizenProfile: true },
    });
  }

  async updateLastLogin(userId: string): Promise<void> {
    await prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
  }

  findCitizenProfileByUserId(userId: string): Promise<CitizenProfile | null> {
    return prisma.citizenProfile.findUnique({ where: { userId } });
  }

  updateCitizenProfile(citizenId: string, input: CitizenProfileUpdateInput): Promise<CitizenProfile> {
    return prisma.citizenProfile.update({ where: { id: citizenId }, data: input });
  }

  createRefreshToken(input: { tokenHash: string; userId: string; expiresAt: Date }): Promise<RefreshToken> {
    return prisma.refreshToken.create({ data: input });
  }

  findRefreshTokenByHash(tokenHash: string): Promise<RefreshTokenWithUser | null> {
    return prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: { select: { id: true, role: true, isActive: true } } },
    });
  }

  async revokeRefreshTokenIfActive(refreshTokenId: string, revokedAt: Date): Promise<boolean> {
    const result = await prisma.refreshToken.updateMany({
      where: { id: refreshTokenId, revokedAt: null, expiresAt: { gt: revokedAt } },
      data: { revokedAt },
    });
    return result.count === 1;
  }
}
