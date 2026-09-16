import bcrypt from "bcryptjs";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { AuthRepository } from "../src/repositories/auth.repository";
import type { DemoProfileForLogin, DemoProfileRepository, OwnedDemoProfile, OwnedMockIssuedDocument } from "../src/repositories/demo-profile.repository";
import { AuthService } from "../src/services/auth.service";
import { DemoProfileService } from "../src/services/demo-profile.service";

const profileA = {
  id: "demo-profile-a", profileCode: "DP-001", normalizedMobile: "9000000001", mockOtpHash: "", citizenProfileId: "citizen-a", isDemo: true,
  createdAt: new Date("2024-01-01"), updatedAt: new Date("2024-01-01"),
  citizenProfile: {
    id: "citizen-a", userId: "user-a", fullName: "Rahul Sharma", phone: "9000000001", dateOfBirth: null, address: null, city: null, state: null, pincode: null, createdAt: new Date(), updatedAt: new Date(),
    user: { id: "user-a", email: "rahul.sharma.demo@jansevax.test", passwordHash: "not-returned", role: "CITIZEN", displayName: "Rahul Sharma", isActive: true, lastLoginAt: null, createdAt: new Date(), updatedAt: new Date() },
  },
};
const profileB = {
  ...profileA, id: "demo-profile-b", profileCode: "DP-002", normalizedMobile: "9000000002", citizenProfileId: "citizen-b",
  citizenProfile: { ...profileA.citizenProfile, id: "citizen-b", userId: "user-b", fullName: "Priya Verma", user: { ...profileA.citizenProfile.user, id: "user-b", email: "priya.verma.demo@jansevax.test", displayName: "Priya Verma" } },
};
const documentA = {
  id: "document-a", documentCode: "DP-001-AADHAAR", demoCitizenProfileId: "demo-profile-a", documentType: "MOCK_AADHAAR_CARD", displayName: "Mock Aadhaar Card", issuer: "JANSEVA-X Demo Identity Registry", issueDate: new Date("2024-01-15"), expiryDate: null, status: "AVAILABLE", structuredFields: { holderName: "Rahul Sharma", documentReference: "MOCK-AADHAAR-DP001" }, isDemo: true, createdAt: new Date(), updatedAt: new Date(),
};

class InMemoryDemoProfileRepository implements DemoProfileRepository {
  async findForDemoLogin(mobile: string) {
    if (mobile === profileA.normalizedMobile) return profileA as unknown as DemoProfileForLogin;
    if (mobile === profileB.normalizedMobile) return profileB as unknown as DemoProfileForLogin;
    return null;
  }

  async findByUserId(userId: string) {
    if (userId !== "user-a") return null;
    return { ...profileA, citizenProfile: { ...profileA.citizenProfile, user: undefined }, issuedDocuments: [documentA] } as unknown as OwnedDemoProfile;
  }

  async findDocumentByIdForUser(documentId: string, userId: string) {
    if (documentId !== documentA.id || userId !== "user-a") return null;
    return { ...documentA, demoCitizenProfile: { ...profileA, citizenProfile: { ...profileA.citizenProfile, user: undefined } } } as unknown as OwnedMockIssuedDocument;
  }
}

describe("demo profile authentication and registry", () => {
  const demoRepository = new InMemoryDemoProfileRepository();
  const authRepository = {
    updateLastLogin: vi.fn(async () => undefined),
    createRefreshToken: vi.fn(async () => ({ id: "refresh-token-a" })),
  } as unknown as AuthRepository;
  const authService = new AuthService(authRepository, demoRepository);
  const profileService = new DemoProfileService(demoRepository);

  beforeAll(async () => { profileA.mockOtpHash = await bcrypt.hash("123456", 10); profileB.mockOtpHash = profileA.mockOtpHash; });

  it("authenticates a valid demo mobile and OTP through the existing token infrastructure", async () => {
    const result = await authService.loginDemo("9000000001", "123456");
    expect(result.user.userId).toBe("user-a");
    expect(result.user.citizenProfile?.id).toBe("citizen-a");
    expect(result.tokens.accessToken).toBeTruthy();
    expect(authRepository.updateLastLogin).toHaveBeenCalledWith("user-a");
  });

  it("rejects an unknown demo mobile and an invalid demo OTP without revealing which failed", async () => {
    await expect(authService.loginDemo("9000000099", "123456")).rejects.toMatchObject({ statusCode: 401, message: "Invalid demo mobile number or OTP" });
    await expect(authService.loginDemo("9000000001", "000000")).rejects.toMatchObject({ statusCode: 401, message: "Invalid demo mobile number or OTP" });
  });

  it("maps a citizen to only its linked demo profile and never exposes the OTP hash", async () => {
    const profile = await profileService.getProfile("user-a");
    expect(profile).toMatchObject({ profileCode: "DP-001", fullName: "Rahul Sharma", issuedDocumentCount: 1, isDemo: true });
    expect(JSON.stringify(profile)).not.toContain("mockOtpHash");
  });

  it("returns only the authenticated citizen's issued documents and rejects cross-citizen access", async () => {
    const documents = await profileService.listIssuedDocuments("user-a");
    expect(documents).toHaveLength(1);
    expect(documents[0]).toMatchObject({ documentId: "document-a", displayName: "Mock Aadhaar Card", isDemo: true });
    expect(JSON.stringify(documents[0])).not.toContain("mockOtpHash");
    await expect(profileService.getIssuedDocument("user-b", "document-a")).rejects.toMatchObject({ statusCode: 404 });
  });
});
