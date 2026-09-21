import { PrismaClient } from "@prisma/client";
import { demoCitizenSeeds } from "./demo-citizen.seed-data";
import { StorageService } from "../src/services/storage/storage.service";

const prisma = new PrismaClient();
const seededCitizenEmails = [
  "demo.citizen@jansevax.test",
  ...demoCitizenSeeds.map((demo) => demo.email),
];

function isStorageKey(value: string): boolean {
  return value === value.split(/[\\/]/).pop();
}

async function main() {
  const users = await prisma.user.findMany({
    where: { email: { in: seededCitizenEmails } },
    select: { id: true, email: true, citizenProfile: { select: { id: true } } },
  });

  const foundEmails = new Set(users.map((user) => user.email));
  const missingEmails = seededCitizenEmails.filter((email) => !foundEmails.has(email));
  if (missingEmails.length > 0 || users.some((user) => !user.citizenProfile)) {
    throw new Error("Seeded Citizen accounts are incomplete. Run prisma:seed before resetting demo activity.");
  }

  const citizenIds = users.map((user) => user.citizenProfile!.id);
  const userIds = users.map((user) => user.id);
  const conversations = await prisma.aIConversation.findMany({
    where: { OR: [{ userId: { in: userIds } }, { citizenId: { in: citizenIds } }] },
    select: { id: true },
  });
  const conversationIds = conversations.map((conversation) => conversation.id);
  const uploadedDocuments = await prisma.document.findMany({
    where: { userId: { in: userIds } },
    select: { storageKey: true },
  });
  const generatedDocuments = await prisma.generatedDocument.findMany({
    where: { application: { citizenId: { in: citizenIds } } },
    select: { storageKey: true },
  });
  const storageKeys = [...uploadedDocuments, ...generatedDocuments]
    .map((document) => document.storageKey)
    .filter(isStorageKey);

  const result = await prisma.$transaction(async (tx) => {
    const deletedMessages = conversationIds.length > 0
      ? await tx.aIMessage.deleteMany({ where: { conversationId: { in: conversationIds } } })
      : { count: 0 };
    const deletedConversations = await tx.aIConversation.deleteMany({
      where: { OR: [{ userId: { in: userIds } }, { citizenId: { in: citizenIds } }] },
    });
    const deletedNotifications = await tx.notification.deleteMany({ where: { userId: { in: userIds } } });
    const deletedApplications = await tx.application.deleteMany({ where: { citizenId: { in: citizenIds } } });
    const deletedExamApplications = await tx.examApplication.deleteMany({ where: { citizenId: { in: citizenIds } } });
    const deletedDocuments = await tx.document.deleteMany({ where: { userId: { in: userIds } } });

    return {
      messages: deletedMessages.count,
      conversations: deletedConversations.count,
      notifications: deletedNotifications.count,
      applications: deletedApplications.count,
      examApplications: deletedExamApplications.count,
      uploadedDocuments: deletedDocuments.count,
    };
  });

  const storage = new StorageService();
  for (const storageKey of storageKeys) await storage.remove(storageKey);

  console.log(JSON.stringify({
    mode: "DEMO/PROTOTYPE",
    preservedCitizenAccounts: seededCitizenEmails,
    cleared: result,
    removedStoredFiles: storageKeys.length,
  }, null, 2));
}

main()
  .catch((error: unknown) => {
    console.error("Demo activity reset failed:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
