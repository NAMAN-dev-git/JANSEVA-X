import { Prisma, PrismaClient, UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";
import { DEMO_OTP, demoCitizenSeeds } from "./demo-citizen.seed-data";

const prisma = new PrismaClient();

const services = [
  {
    name: "Trade Licence",
    slug: "trade-licence",
    description: "DEMO/PROTOTYPE service definition for a trade licence workflow.",
    requirements: [
      ["Identity Proof", "Prototype example requirement; not universal legal guidance.", true],
      ["Address Proof", "Prototype example requirement; not universal legal guidance.", true],
      ["PAN", "Prototype example requirement; not universal legal guidance.", true],
      ["Existing Trade Licence (for renewal)", "Required only for the prototype renewal scenario.", false],
    ],
  },
  { name: "Income Certificate", slug: "income-certificate", description: "DEMO/PROTOTYPE income certificate service.", requirements: [["Identity Proof", "Prototype example requirement.", true], ["Income Supporting Document", "Prototype example requirement.", true]] },
  { name: "Domicile Certificate", slug: "domicile-certificate", description: "DEMO/PROTOTYPE domicile certificate service.", requirements: [["Identity Proof", "Prototype example requirement.", true], ["Address Proof", "Prototype example requirement.", true]] },
  { name: "Birth Certificate", slug: "birth-certificate", description: "DEMO/PROTOTYPE birth certificate service.", requirements: [["Birth Record Supporting Document", "Prototype example requirement.", true]] },
  { name: "Property Documents", slug: "property-documents", description: "DEMO/PROTOTYPE property document service.", requirements: [["Property Supporting Document", "Prototype example requirement.", true], ["Identity Proof", "Prototype example requirement.", true]] },
  { name: "PAN Services", slug: "pan-services", description: "DEMO/PROTOTYPE PAN-related service.", requirements: [["PAN Supporting Document", "Prototype example requirement.", true], ["Identity Proof", "Prototype example requirement.", true]] },
  { name: "Aadhaar Services", slug: "aadhaar-services", description: "DEMO/PROTOTYPE Aadhaar-related service. No live UIDAI integration.", requirements: [["Identity Proof", "Prototype example requirement.", true]] },
  { name: "e-KYC / Verification", slug: "e-kyc-verification", description: "DEMO/PROTOTYPE verification service. No real government verification gateway.", requirements: [["Identity Proof", "Prototype example requirement.", true]] },
] as const;

async function main() {
  for (const service of services) {
    await prisma.governmentService.upsert({
      where: { slug: service.slug },
      update: {
        name: service.name,
        description: service.description,
        isActive: true,
        isPrototype: true,
        requirements: {
          deleteMany: {},
          create: service.requirements.map(([name, description, isRequired], index) => ({ name, description, isRequired, sortOrder: index + 1 })),
        },
      },
      create: {
        name: service.name,
        slug: service.slug,
        description: service.description,
        isPrototype: true,
        requirements: {
          create: service.requirements.map(([name, description, isRequired], index) => ({ name, description, isRequired, sortOrder: index + 1 })),
        },
      },
    });
  }

  const passwordHash = await bcrypt.hash("DemoPassword123!", 12);
  const citizenUser = await prisma.user.upsert({
    where: { email: "demo.citizen@jansevax.test" },
    update: { displayName: "Demo Citizen", passwordHash, role: UserRole.CITIZEN },
    create: { email: "demo.citizen@jansevax.test", displayName: "Demo Citizen", passwordHash, role: UserRole.CITIZEN },
  });
  await prisma.citizenProfile.upsert({
    where: { userId: citizenUser.id },
    update: { fullName: "Demo Citizen", phone: "+910000000000", address: "Synthetic DEMO/PROTOTYPE address only", city: "Demo City", state: "Demo State", pincode: "000000" },
    create: { userId: citizenUser.id, fullName: "Demo Citizen", phone: "+910000000000", address: "Synthetic DEMO/PROTOTYPE address only", city: "Demo City", state: "Demo State", pincode: "000000" },
  });

  // These are deterministic, explicitly fictional accounts for the hackathon
  // demo. A mobile number and a hashed demo-only OTP map to the linked profile;
  // no matching is performed using a display name.
  const mockOtpHash = await bcrypt.hash(DEMO_OTP, 12);
  for (const demo of demoCitizenSeeds) {
    const user = await prisma.user.upsert({
      where: { email: demo.email },
      update: { displayName: demo.fullName, passwordHash, role: UserRole.CITIZEN, isActive: true },
      create: { email: demo.email, displayName: demo.fullName, passwordHash, role: UserRole.CITIZEN },
    });
    const citizenProfile = await prisma.citizenProfile.upsert({
      where: { userId: user.id },
      update: {
        fullName: demo.fullName,
        phone: demo.mobile,
        dateOfBirth: new Date(`${demo.dateOfBirth}T00:00:00.000Z`),
        address: demo.address,
        city: demo.city,
        state: demo.state,
        pincode: demo.pincode,
      },
      create: {
        userId: user.id,
        fullName: demo.fullName,
        phone: demo.mobile,
        dateOfBirth: new Date(`${demo.dateOfBirth}T00:00:00.000Z`),
        address: demo.address,
        city: demo.city,
        state: demo.state,
        pincode: demo.pincode,
      },
    });
    const demoProfile = await prisma.demoCitizenProfile.upsert({
      where: { profileCode: demo.profileCode },
      update: {
        normalizedMobile: demo.mobile,
        mockOtpHash,
        citizenProfileId: citizenProfile.id,
        isDemo: true,
      },
      create: {
        profileCode: demo.profileCode,
        normalizedMobile: demo.mobile,
        mockOtpHash,
        citizenProfileId: citizenProfile.id,
        isDemo: true,
      },
    });
    for (const [documentCode, documentType, displayName, issuer, issueDate, expiryDate, structuredFields] of demo.documents) {
      const data = {
        demoCitizenProfileId: demoProfile.id,
        documentType,
        displayName,
        issuer,
        issueDate: new Date(`${issueDate}T00:00:00.000Z`),
        expiryDate: expiryDate ? new Date(`${expiryDate}T00:00:00.000Z`) : null,
        status: "AVAILABLE",
        structuredFields: structuredFields as unknown as Prisma.InputJsonValue,
        isDemo: true,
      };
      await prisma.mockIssuedDocument.upsert({ where: { documentCode }, update: data, create: { documentCode, ...data } });
    }
  }

  const officerUser = await prisma.user.upsert({
    where: { email: "demo.officer@jansevax.test" },
    update: { displayName: "Demo Officer", passwordHash, role: UserRole.OFFICER },
    create: { email: "demo.officer@jansevax.test", displayName: "Demo Officer", passwordHash, role: UserRole.OFFICER },
  });
  await prisma.officer.upsert({
    where: { userId: officerUser.id },
    update: { employeeIdentifier: "DEMO-OFFICER-001", department: "Prototype Document Services", designation: "Demo Reviewing Officer" },
    create: { userId: officerUser.id, employeeIdentifier: "DEMO-OFFICER-001", department: "Prototype Document Services", designation: "Demo Reviewing Officer" },
  });
}

main()
  .then(() => console.log("DEMO/PROTOTYPE seed completed."))
  .catch((error: unknown) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
