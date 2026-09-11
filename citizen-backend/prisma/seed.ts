import { PrismaClient, UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";

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
