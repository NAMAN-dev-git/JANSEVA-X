import { describe, expect, it } from "vitest";
import { demoCitizenSeeds } from "../prisma/demo-citizen.seed-data";

describe("demo citizen seed fixtures", () => {
  it("contains exactly five fictional profiles with four or five uniquely keyed mock documents", () => {
    expect(demoCitizenSeeds).toHaveLength(5);
    expect(new Set(demoCitizenSeeds.map((profile) => profile.profileCode)).size).toBe(5);
    expect(new Set(demoCitizenSeeds.map((profile) => profile.mobile)).size).toBe(5);
    const documentCodes = demoCitizenSeeds.flatMap((profile) => profile.documents.map(([documentCode]) => documentCode));
    expect(new Set(documentCodes).size).toBe(documentCodes.length);
    for (const profile of demoCitizenSeeds) {
      expect(profile.documents.length).toBeGreaterThanOrEqual(4);
      expect(profile.documents.length).toBeLessThanOrEqual(5);
      expect(profile.documents.every(([, documentType, displayName, issuer]) => documentType.startsWith("MOCK_") && displayName.startsWith("Mock ") && issuer.startsWith("JANSEVA-X Demo"))).toBe(true);
    }
  });

  it("has stable natural keys, which are the unique upsert keys used by repeated seed runs", () => {
    const firstRunKeys = demoCitizenSeeds.flatMap((profile) => [profile.profileCode, ...profile.documents.map(([documentCode]) => documentCode)]);
    const secondRunKeys = demoCitizenSeeds.flatMap((profile) => [profile.profileCode, ...profile.documents.map(([documentCode]) => documentCode)]);
    expect(secondRunKeys).toEqual(firstRunKeys);
    expect(new Set(firstRunKeys).size).toBe(firstRunKeys.length);
  });

  it("provides every demo profile its own identity-reuse document without inventing missing registry records", () => {
    for (const profile of demoCitizenSeeds) {
      const types = profile.documents.map(([, documentType]) => documentType);
      expect(types).toContain("MOCK_AADHAAR_CARD");
      expect(types).toContain("MOCK_PAN_CARD");
      expect(types).toContain("MOCK_ADDRESS_CERTIFICATE");
    }
    expect(demoCitizenSeeds.find((profile) => profile.profileCode === "DP-003")?.documents.map(([, type]) => type)).not.toContain("MOCK_10TH_MARKSHEET");
    expect(demoCitizenSeeds.find((profile) => profile.profileCode === "DP-004")?.documents.map(([, type]) => type)).not.toContain("MOCK_BIRTH_CERTIFICATE");
  });
});
