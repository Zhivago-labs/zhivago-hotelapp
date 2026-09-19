-- Fase 1 do CRM B2B (docs/crm-b2b-organizacoes-leads.md): evolui Company/CompanyMember (Fase B)
-- em vez de criar estrutura paralela. Dados existentes preservados, nada é apagado.

-- ─── Company -> Organization ──────────────────────────────────────────────────
ALTER TABLE "Company" RENAME TO "Organization";
ALTER TABLE "Organization" RENAME CONSTRAINT "Company_pkey" TO "Organization_pkey";

ALTER TABLE "Organization" ADD COLUMN "type" TEXT NOT NULL DEFAULT 'AGENCY';
ALTER TABLE "Organization" ADD COLUMN "email" TEXT;
ALTER TABLE "Organization" ADD COLUMN "phone" TEXT;
ALTER TABLE "Organization" ADD COLUMN "logo" TEXT;
ALTER TABLE "Organization" ADD COLUMN "description" TEXT;
ALTER TABLE "Organization" ADD COLUMN "leadDistributionMode" TEXT NOT NULL DEFAULT 'MANUAL';
ALTER TABLE "Organization" ADD COLUMN "leadRoundRobinCursor" TEXT;
ALTER TABLE "Organization" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- ─── CompanyMember -> OrganizationMember ──────────────────────────────────────
ALTER TABLE "CompanyMember" RENAME TO "OrganizationMember";
ALTER TABLE "OrganizationMember" RENAME CONSTRAINT "CompanyMember_pkey" TO "OrganizationMember_pkey";
ALTER TABLE "OrganizationMember" RENAME COLUMN "companyId" TO "organizationId";
ALTER TABLE "OrganizationMember" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Consolida os 2 papéis antigos nos 4 novos: dono continua OWNER, quem era AGENT vira BROKER
-- (papel de "linha de frente" também no modelo novo).
UPDATE "OrganizationMember" SET "role" = 'BROKER' WHERE "role" = 'AGENT';

ALTER INDEX "CompanyMember_userId_key" RENAME TO "OrganizationMember_userId_key";
ALTER INDEX "CompanyMember_companyId_idx" RENAME TO "OrganizationMember_organizationId_idx";

ALTER TABLE "OrganizationMember" RENAME CONSTRAINT "CompanyMember_userId_fkey" TO "OrganizationMember_userId_fkey";
ALTER TABLE "OrganizationMember" RENAME CONSTRAINT "CompanyMember_companyId_fkey" TO "OrganizationMember_organizationId_fkey";

-- ─── Listing.companyId -> Listing.organizationId ──────────────────────────────
ALTER TABLE "Listing" RENAME COLUMN "companyId" TO "organizationId";
ALTER INDEX "Listing_companyId_idx" RENAME TO "Listing_organizationId_idx";
ALTER TABLE "Listing" RENAME CONSTRAINT "Listing_companyId_fkey" TO "Listing_organizationId_fkey";

-- ─── OrganizationInvite (novo) ─────────────────────────────────────────────────
CREATE TABLE "OrganizationInvite" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "invitedBy" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrganizationInvite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrganizationInvite_token_key" ON "OrganizationInvite"("token");
CREATE INDEX "OrganizationInvite_organizationId_idx" ON "OrganizationInvite"("organizationId");
CREATE INDEX "OrganizationInvite_email_idx" ON "OrganizationInvite"("email");

ALTER TABLE "OrganizationInvite" ADD CONSTRAINT "OrganizationInvite_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
