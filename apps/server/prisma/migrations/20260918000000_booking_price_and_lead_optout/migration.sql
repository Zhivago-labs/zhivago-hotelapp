-- Booking: preço travado no momento da reserva + desconto pontual por reserva.
ALTER TABLE "Booking" ADD COLUMN "price" DOUBLE PRECISION;
ALTER TABLE "Booking" ADD COLUMN "discountedPrice" DOUBLE PRECISION;

-- Backfill best-effort para reservas já existentes: usa o preço atual do anúncio, já que não
-- havia snapshot antes. A partir daqui toda reserva nova grava o próprio preço na criação.
UPDATE "Booking" b
SET "price" = l."price"
FROM "Listing" l
WHERE l."id" = b."listingId" AND b."price" IS NULL;

-- OrganizationMember: opt-out de receber leads.
ALTER TABLE "OrganizationMember" ADD COLUMN "receiveLeads" BOOLEAN NOT NULL DEFAULT true;
