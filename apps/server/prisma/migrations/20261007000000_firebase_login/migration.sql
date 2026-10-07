-- Login com Google via Firebase: contas sem senha, vínculo com o uid do Firebase e etapa de
-- escolha do tipo de uso (pessoal ou imobiliária). Contas existentes já concluíram o cadastro.

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL,
ADD COLUMN     "firebaseUid" TEXT,
ADD COLUMN     "onboardingCompleted" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE UNIQUE INDEX "User_firebaseUid_key" ON "User"("firebaseUid");
