-- Uma avaliação por estadia: Review passa a apontar para a reserva avaliada.
ALTER TABLE "Review" ADD COLUMN "bookingId" TEXT;

CREATE UNIQUE INDEX "Review_bookingId_key" ON "Review"("bookingId");

ALTER TABLE "Review" ADD CONSTRAINT "Review_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Avaliações antigas: vincula a n-ésima avaliação de cada (usuário, imóvel) à n-ésima reserva
-- confirmada do mesmo par, pra que a mesma estadia não possa ser avaliada de novo.
WITH r AS (
  SELECT "id", "userId", "listingId",
         ROW_NUMBER() OVER (PARTITION BY "userId", "listingId" ORDER BY "createdAt") AS rn
  FROM "Review"
), b AS (
  SELECT "id", "userId", "listingId",
         ROW_NUMBER() OVER (PARTITION BY "userId", "listingId" ORDER BY "endDate") AS rn
  FROM "Booking"
  WHERE "status" = 'CONFIRMED'
)
UPDATE "Review"
SET "bookingId" = b."id"
FROM r
JOIN b ON b."userId" = r."userId" AND b."listingId" = r."listingId" AND b.rn = r.rn
WHERE "Review"."id" = r."id";
