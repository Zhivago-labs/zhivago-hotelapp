ALTER TABLE "User" ADD COLUMN "coverUrl" TEXT, ADD COLUMN "publicDescription" TEXT, ADD COLUMN "publicLocation" TEXT, ADD COLUMN "publicPhone" TEXT, ADD COLUMN "publicEmail" TEXT;
ALTER TABLE "Organization" ADD COLUMN "coverUrl" TEXT, ADD COLUMN "publicLocation" TEXT;
UPDATE "User" SET "publicPhone" = "phone" WHERE "accountType" = 'AGENCY';
