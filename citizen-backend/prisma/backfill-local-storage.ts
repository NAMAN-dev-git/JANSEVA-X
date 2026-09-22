import { promises as fs } from "fs";
import path from "path";
import { env } from "../src/config/env";
import { prisma } from "../src/lib/prisma";

const storageKeyPattern = /^[0-9a-f-]{36}\.(pdf|jpg|jpeg|png)$/i;

type StoredFileDatabase = {
  storedFile: {
    create(input: { data: { storageKey: string; contents: Buffer } }): Promise<unknown>;
  };
};

/**
 * One-time operator command for legacy local uploads. It is deliberately not
 * part of app startup or Prisma migration execution.
 */
async function main(): Promise<void> {
  const uploadDirectory = resolveUploadDirectory(env.UPLOAD_DIR);
  const database = prisma as unknown as StoredFileDatabase;
  const entries = await fs.readdir(uploadDirectory, { withFileTypes: true });
  let imported = 0;
  let alreadyStored = 0;

  for (const entry of entries) {
    if (!entry.isFile() || !storageKeyPattern.test(entry.name)) continue;
    try {
      await database.storedFile.create({
        data: { storageKey: entry.name, contents: await fs.readFile(path.join(uploadDirectory, entry.name)) },
      });
      imported += 1;
    } catch (error) {
      if (isUniqueViolation(error)) {
        alreadyStored += 1;
        continue;
      }
      throw error;
    }
  }

  console.log(`Legacy storage backfill complete: ${imported} imported, ${alreadyStored} already stored.`);
}

function resolveUploadDirectory(configuredDirectory: string): string {
  const projectRoot = path.resolve(process.cwd());
  if (path.isAbsolute(configuredDirectory)) throw new Error("UPLOAD_DIR must be a relative path inside the backend directory");
  const resolved = path.resolve(projectRoot, configuredDirectory);
  if (!resolved.startsWith(`${projectRoot}${path.sep}`)) throw new Error("UPLOAD_DIR must stay inside the backend directory");
  return resolved;
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "P2002");
}

main()
  .catch(() => { console.error("Legacy storage backfill failed"); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
