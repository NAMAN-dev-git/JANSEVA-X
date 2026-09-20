-- Forward repair for the reconstructed baseline: User.email is @unique in
-- schema.prisma and is the conflict target used by prisma/seed.ts upserts.
ALTER TABLE "users"
  ADD CONSTRAINT "users_email_key" UNIQUE ("email");
