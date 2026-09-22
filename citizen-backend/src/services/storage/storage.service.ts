import path from "path";
import { AppError } from "../../utils/app-error";
import { PrismaStorageProvider } from "./prisma-storage.provider";
import type { StorageProvider } from "./storage.provider";

export class StorageService {
  constructor(private readonly provider: StorageProvider = new PrismaStorageProvider()) {}

  async store(contents: Buffer, originalFilename: string) {
    const extension = path.extname(originalFilename).toLowerCase();
    try {
      return await this.provider.store({ contents, extension });
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError("Document could not be stored", 500);
    }
  }

  async read(storageKey: string): Promise<Buffer> {
    try {
      return await this.provider.read(storageKey);
    } catch {
      throw new AppError("Stored document is unavailable", 422);
    }
  }

  async remove(storageKey: string): Promise<void> {
    try {
      await this.provider.remove(storageKey);
    } catch {
      throw new AppError("Stored document could not be removed", 500);
    }
  }
}
