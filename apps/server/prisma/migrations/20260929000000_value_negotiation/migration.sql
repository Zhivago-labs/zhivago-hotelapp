-- Negociação de valor no chat (ver lib/negotiations.ts). Aditiva para anúncios e reservas; as
-- propostas de compra já existentes (Offer) viram a 1ª rodada de uma Negotiation cada (backfill).

-- AlterTable
ALTER TABLE "Listing" ADD COLUMN     "acceptsNegotiation" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "minNegotiablePrice" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "Negotiation" (
    "id" TEXT NOT NULL,
    "operationType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "referencePrice" DOUBLE PRECISION NOT NULL,
    "agreedValue" DOUBLE PRECISION,
    "listingId" TEXT NOT NULL,
    "conversationId" TEXT,
    "customerId" TEXT NOT NULL,
    "leadId" TEXT,
    "bookingId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Negotiation_pkey" PRIMARY KEY ("id")
);

-- AlterTable (colunas novas nullable primeiro; NOT NULL só depois do backfill)
ALTER TABLE "Offer" ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "negotiationId" TEXT,
ADD COLUMN     "previousOfferId" TEXT,
ADD COLUMN     "proposedById" TEXT,
ADD COLUMN     "unit" TEXT NOT NULL DEFAULT 'TOTAL',
ALTER COLUMN "paymentMethod" DROP NOT NULL;

-- Backfill: uma Negotiation por Offer existente. A conversa é a do comprador naquele imóvel (mesma
-- busca que o fluxo antigo usava: propertyId + comprador entre os participantes).
INSERT INTO "Negotiation" ("id", "operationType", "status", "referencePrice", "agreedValue", "listingId",
                           "conversationId", "customerId", "leadId", "createdAt", "updatedAt")
SELECT
    'neg_' || o."id",
    'SALE',
    CASE o."status" WHEN 'PENDING' THEN 'OPEN' WHEN 'ACCEPTED' THEN 'AGREED' ELSE 'CLOSED' END,
    l."price",
    CASE WHEN o."status" = 'ACCEPTED' THEN o."value" ELSE NULL END,
    o."listingId",
    (
        SELECT c."id" FROM "Conversation" c
        JOIN "_ConversationParticipants" cp ON cp."A" = c."id" AND cp."B" = o."buyerId"
        WHERE c."propertyId" = o."listingId"
        ORDER BY c."createdAt" ASC
        LIMIT 1
    ),
    o."buyerId",
    o."leadId",
    o."createdAt",
    o."createdAt"
FROM "Offer" o
JOIN "Listing" l ON l."id" = o."listingId";

UPDATE "Offer" SET "negotiationId" = 'neg_' || "id", "proposedById" = "buyerId";

-- No máximo uma negociação OPEN por conversa: se o fluxo antigo deixou várias propostas pendentes
-- do mesmo cliente, só a mais recente continua aberta; as anteriores são canceladas (o aceite
-- antigo já cancelava as demais pendentes de qualquer forma).
WITH ranked AS (
    SELECT n."id", ROW_NUMBER() OVER (PARTITION BY n."conversationId" ORDER BY n."createdAt" DESC) AS rn
    FROM "Negotiation" n
    WHERE n."status" = 'OPEN' AND n."conversationId" IS NOT NULL
)
UPDATE "Negotiation" SET "status" = 'CLOSED' WHERE "id" IN (SELECT "id" FROM ranked WHERE rn > 1);

UPDATE "Offer" o SET "status" = 'CANCELLED'
FROM "Negotiation" n
WHERE o."negotiationId" = n."id" AND n."status" = 'CLOSED' AND o."status" = 'PENDING';

ALTER TABLE "Offer" ALTER COLUMN "negotiationId" SET NOT NULL,
ALTER COLUMN "proposedById" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Negotiation_listingId_status_idx" ON "Negotiation"("listingId", "status");

-- CreateIndex
CREATE INDEX "Negotiation_conversationId_idx" ON "Negotiation"("conversationId");

-- CreateIndex
CREATE INDEX "Negotiation_customerId_idx" ON "Negotiation"("customerId");

-- CreateIndex
CREATE INDEX "Negotiation_leadId_idx" ON "Negotiation"("leadId");

-- Garantia no banco de no máximo 1 negociação OPEN por conversa — Prisma não expressa índice
-- único parcial no schema.
CREATE UNIQUE INDEX "Negotiation_one_open_per_conversation" ON "Negotiation"("conversationId") WHERE "status" = 'OPEN';

-- CreateIndex
CREATE UNIQUE INDEX "Offer_previousOfferId_key" ON "Offer"("previousOfferId");

-- CreateIndex
CREATE INDEX "Offer_negotiationId_status_idx" ON "Offer"("negotiationId", "status");

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_proposedById_fkey" FOREIGN KEY ("proposedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_negotiationId_fkey" FOREIGN KEY ("negotiationId") REFERENCES "Negotiation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_previousOfferId_fkey" FOREIGN KEY ("previousOfferId") REFERENCES "Offer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Negotiation" ADD CONSTRAINT "Negotiation_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Negotiation" ADD CONSTRAINT "Negotiation_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Negotiation" ADD CONSTRAINT "Negotiation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Negotiation" ADD CONSTRAINT "Negotiation_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Negotiation" ADD CONSTRAINT "Negotiation_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;
