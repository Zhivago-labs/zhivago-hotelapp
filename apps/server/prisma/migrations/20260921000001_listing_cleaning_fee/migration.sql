-- Taxa de limpeza da diária (seção 5/52 da spec) — necessária pro snapshot de preço do Booking
-- (Sprint 6). Nullable/aditiva: nenhum anúncio existente é afetado.
ALTER TABLE "Listing" ADD COLUMN "cleaningFee" DOUBLE PRECISION;
