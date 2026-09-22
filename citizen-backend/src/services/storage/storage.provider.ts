export interface StoredFile {
  storageKey: string;
}

/** Storage boundary: replace this provider with an object-store implementation without changing document business rules. */
export interface StorageProvider {
  store(input: { contents: Buffer; extension: string }): Promise<StoredFile>;
  read(storageKey: string): Promise<Buffer>;
  remove(storageKey: string): Promise<void>;
}
