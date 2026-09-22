-- Sprint 1 da refatoração CRM/Listing (ver docs/zhivago-especificacao-completa-crm-cadastro-imoveis-pagina-publica.md).
-- Só modelo e contratos: nenhum controller foi alterado nesta migration. Tudo aditivo/nullable —
-- nada aqui quebra o código atual, que ainda ignora as colunas novas.

-- ─── Listing: operationType, área, suítes ───────────────────────────────────────
ALTER TABLE "Listing" ADD COLUMN "operationType" TEXT NOT NULL DEFAULT 'DAILY_RENT';
ALTER TABLE "Listing" ADD COLUMN "suites" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Listing" ADD COLUMN "privateArea" DOUBLE PRECISION;
ALTER TABLE "Listing" ADD COLUMN "totalArea" DOUBLE PRECISION;

-- Backfill a partir do par category+billingCycle existente (seção 3 da spec).
UPDATE "Listing"
SET "operationType" = CASE
  WHEN "category" = 'venda' THEN 'SALE'
  WHEN "category" = 'aluguel' AND "billingCycle" = 'mês' THEN 'MONTHLY_RENT'
  ELSE 'DAILY_RENT'
END;

CREATE INDEX "Listing_operationType_idx" ON "Listing"("operationType");

-- ─── Listing: createdById (quem cadastrou, distinto de agentId) ─────────────────
ALTER TABLE "Listing" ADD COLUMN "createdById" TEXT;

-- Backfill best-effort: para anúncios já existentes não há como saber quem cadastrou de fato,
-- então assume-se o responsável comercial (agentId) ou, na ausência dele, o dono (ownerId).
UPDATE "Listing"
SET "createdById" = COALESCE("agentId", "ownerId")
WHERE "createdById" IS NULL;

CREATE INDEX "Listing_createdById_idx" ON "Listing"("createdById");
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── OrganizationBuilding (empreendimento — seção 8 da spec) ────────────────────
CREATE TABLE "OrganizationBuilding" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "organizationId" TEXT NOT NULL,
    "leadOwnerMemberId" TEXT,
    "backupMemberId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrganizationBuilding_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OrganizationBuilding_organizationId_idx" ON "OrganizationBuilding"("organizationId");
CREATE INDEX "OrganizationBuilding_leadOwnerMemberId_idx" ON "OrganizationBuilding"("leadOwnerMemberId");
CREATE INDEX "OrganizationBuilding_backupMemberId_idx" ON "OrganizationBuilding"("backupMemberId");

ALTER TABLE "OrganizationBuilding" ADD CONSTRAINT "OrganizationBuilding_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrganizationBuilding" ADD CONSTRAINT "OrganizationBuilding_leadOwnerMemberId_fkey" FOREIGN KEY ("leadOwnerMemberId") REFERENCES "OrganizationMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OrganizationBuilding" ADD CONSTRAINT "OrganizationBuilding_backupMemberId_fkey" FOREIGN KEY ("backupMemberId") REFERENCES "OrganizationMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── Listing.buildingId ──────────────────────────────────────────────────────────
ALTER TABLE "Listing" ADD COLUMN "buildingId" TEXT;
CREATE INDEX "Listing_buildingId_idx" ON "Listing"("buildingId");
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "OrganizationBuilding"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── Conversation.leadId (conversa principal do Lead — seção 25 da spec) ────────
ALTER TABLE "Conversation" ADD COLUMN "leadId" TEXT;
CREATE INDEX "Conversation_leadId_idx" ON "Conversation"("leadId");
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── Offer.leadId (seção 43/106 da spec) ─────────────────────────────────────────
ALTER TABLE "Offer" ADD COLUMN "leadId" TEXT;
CREATE INDEX "Offer_leadId_idx" ON "Offer"("leadId");
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── Booking.leadId + snapshot de preço (seção 51/52/106 da spec) ────────────────
ALTER TABLE "Booking" ADD COLUMN "leadId" TEXT;
ALTER TABLE "Booking" ADD COLUMN "nightlyRateSnapshot" DOUBLE PRECISION;
ALTER TABLE "Booking" ADD COLUMN "nights" INTEGER;
ALTER TABLE "Booking" ADD COLUMN "cleaningFeeSnapshot" DOUBLE PRECISION;
ALTER TABLE "Booking" ADD COLUMN "subtotal" DOUBLE PRECISION;
ALTER TABLE "Booking" ADD COLUMN "total" DOUBLE PRECISION;
CREATE INDEX "Booking_leadId_idx" ON "Booking"("leadId");
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── LeadAssignment.source (seção 32 da spec) ────────────────────────────────────
ALTER TABLE "LeadAssignment" ADD COLUMN "source" TEXT;

-- ─── Lead único: 1 cliente + 1 imóvel = 1 Lead (seção 21 da spec) ────────────────
-- Antes de criar a constraint, deduplica qualquer Lead pré-existente pro mesmo (userId, listingId):
-- mantém o mais antigo, reatribui os registros filhos (assignments/interactions/visits) pro Lead
-- mantido e apaga os duplicados. Conversation/Offer/Booking.leadId acabaram de ser criados (tudo
-- NULL ainda), então não há nada pra reatribuir neles.
CREATE TEMP TABLE "_lead_dedup" ON COMMIT DROP AS
SELECT
  "id",
  ROW_NUMBER() OVER (PARTITION BY "userId", "listingId" ORDER BY "createdAt" ASC, "id" ASC) AS "rn",
  FIRST_VALUE("id") OVER (PARTITION BY "userId", "listingId" ORDER BY "createdAt" ASC, "id" ASC) AS "keepId"
FROM "Lead";

UPDATE "LeadAssignment" "la"
SET "leadId" = "d"."keepId"
FROM "_lead_dedup" "d"
WHERE "la"."leadId" = "d"."id" AND "d"."rn" > 1;

UPDATE "LeadInteraction" "li"
SET "leadId" = "d"."keepId"
FROM "_lead_dedup" "d"
WHERE "li"."leadId" = "d"."id" AND "d"."rn" > 1;

UPDATE "Visit" "v"
SET "leadId" = "d"."keepId"
FROM "_lead_dedup" "d"
WHERE "v"."leadId" = "d"."id" AND "d"."rn" > 1;

DELETE FROM "Lead" "l"
USING "_lead_dedup" "d"
WHERE "l"."id" = "d"."id" AND "d"."rn" > 1;

CREATE UNIQUE INDEX "Lead_userId_listingId_key" ON "Lead"("userId", "listingId");

-- ─── LeadAssignment: no máximo 1 assignment aberto por Lead (seção 31 da spec) ───
-- Cobre também o caso de dois assignments abertos terem sido mesclados no mesmo Lead pelo dedup
-- acima: mantém apenas o mais recente aberto por Lead, fecha os demais antes de criar o índice.
CREATE TEMP TABLE "_open_assignment_rank" ON COMMIT DROP AS
SELECT
  "id",
  ROW_NUMBER() OVER (PARTITION BY "leadId" ORDER BY "assignedAt" DESC, "id" DESC) AS "rn"
FROM "LeadAssignment"
WHERE "unassignedAt" IS NULL;

UPDATE "LeadAssignment" "la"
SET "unassignedAt" = CURRENT_TIMESTAMP
FROM "_open_assignment_rank" "r"
WHERE "la"."id" = "r"."id" AND "r"."rn" > 1;

CREATE UNIQUE INDEX "LeadAssignment_one_current_per_lead" ON "LeadAssignment"("leadId") WHERE "unassignedAt" IS NULL;
