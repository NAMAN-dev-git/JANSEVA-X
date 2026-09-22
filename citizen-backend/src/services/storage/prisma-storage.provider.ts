import { randomUUID } from "crypto";
import { prisma } from "../../lib/prisma";
import type { StorageProvider, StoredFile } from "./storage.provider";

const safeExtensions = new Set([".pdf", ".jpg", ".jpeg", ".png"]);

type StoredFileDatabase = {
  storedFile: {
    create(input: { data: { storageKey: string; contents: Buffer } }): Promise<unknown>;
    findUnique(input: { where: { storageKey: string }; select: { contents: true } }): Promise<{ contents: Uint8Array } | null>;
    deleteMany(input: { where: { storageKey: string } }): Promise<unknown>;
  };
};

/** Stores demo document bytes in the existing Neon PostgreSQL database. */
export class PrismaStorageProvider implements StorageProvider {
  // Keep this structural boundary so application typechecks do not require a
  // local generated client to be refreshed before Vercel runs prisma generate.
  constructor(private readonly database: StoredFileDatabase = prisma as unknown as StoredFileDatabase) {}

  async store(input: { contents: Buffer; extension: string }): Promise<StoredFile> {
    const extension = input.extension.toLowerCase();
    if (!safeExtensions.has(extension)) throw new Error("Unsupported storage extension");
    const storageKey = `${randomUUID()}${extension}`;
    await this.database.storedFile.create({ data: { storageKey, contents: input.contents } });
    return { storageKey };
  }

  async read(storageKey: string): Promise<Buffer> {
    const stored = await this.database.storedFile.findUnique({ where: { storageKey }, select: { contents: true } });
    if (!stored) throw new Error("Stored file not found");
    return Buffer.from(stored.contents);
  }

  async remove(storageKey: string): Promise<void> {
    await this.database.storedFile.deleteMany({ where: { storageKey } });
  }
}
