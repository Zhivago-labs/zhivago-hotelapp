-- CRM: Contatos como base histórica, encerramento estruturado, fila sem responsável,
-- histórico de entradas e primeira resposta efetiva (docs/mapeamento-crm-zhivago.md).

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "closedAt" TIMESTAMP(3),
ADD COLUMN     "closedById" TEXT,
ADD COLUMN     "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "lostNote" TEXT,
ADD COLUMN     "lostReason" TEXT,
ADD COLUMN     "queueReason" TEXT,
ADD COLUMN     "queuedAt" TIMESTAMP(3),
ADD COLUMN     "reopenedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "LeadAssignment" ADD COLUMN     "firstContactChannel" TEXT;

-- AlterTable
ALTER TABLE "LeadInteraction" ADD COLUMN     "outcome" TEXT;

-- AlterTable
ALTER TABLE "LeadTask" ADD COLUMN     "assigneeId" TEXT;

-- CreateTable
CREATE TABLE "LeadEntry" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'ENTRY',
    "previousStatus" TEXT,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeadEntry_leadId_createdAt_idx" ON "LeadEntry"("leadId", "createdAt");

-- CreateIndex
CREATE INDEX "Lead_organizationId_lastActivityAt_idx" ON "Lead"("organizationId", "lastActivityAt");

-- AddForeignKey
ALTER TABLE "LeadEntry" ADD CONSTRAINT "LeadEntry_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadTask" ADD CONSTRAINT "LeadTask_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "OrganizationMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── Backfill (idempotente: só preenche o que está vazio / ainda não existe) ───────────────────

-- 1ª entrada de cada lead existente, com a origem que consta no banco.
INSERT INTO "LeadEntry" ("id", "leadId", "source", "kind", "createdAt")
SELECT gen_random_uuid()::text, l."id", l."source", 'ENTRY', l."createdAt"
FROM "Lead" l
WHERE NOT EXISTS (SELECT 1 FROM "LeadEntry" e WHERE e."leadId" = l."id");

-- Última atividade = evento comercial mais recente conhecido.
UPDATE "Lead" l SET "lastActivityAt" = GREATEST(
  l."createdAt",
  COALESCE((SELECT MAX(i."createdAt") FROM "LeadInteraction" i WHERE i."leadId" = l."id"), l."createdAt"),
  COALESCE((SELECT MAX(v."createdAt") FROM "Visit" v WHERE v."leadId" = l."id"), l."createdAt"),
  COALESCE((SELECT MAX(t."createdAt") FROM "LeadTask" t WHERE t."leadId" = l."id"), l."createdAt"),
  COALESCE((SELECT MAX(m."createdAt") FROM "Message" m JOIN "Conversation" c ON c."id" = m."conversationId" WHERE c."leadId" = l."id"), l."createdAt")
);

-- Desfecho de leads já encerrados: data aproximada = última atualização (motivo fica "não registrado").
UPDATE "Lead" SET "closedAt" = "updatedAt" WHERE "status" IN ('WON', 'LOST') AND "closedAt" IS NULL;

-- Leads abertos sem atribuição aberta entram na fila com a data de entrada.
UPDATE "Lead" l SET "queuedAt" = l."createdAt", "queueReason" = 'LEGACY'
WHERE l."status" NOT IN ('WON', 'LOST') AND l."queuedAt" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "LeadAssignment" a WHERE a."leadId" = l."id" AND a."unassignedAt" IS NULL);
