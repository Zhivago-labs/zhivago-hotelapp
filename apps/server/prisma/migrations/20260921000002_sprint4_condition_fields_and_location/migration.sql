-- Sprint 4 do CRM/Listing rework (cadastro de imóveis) — todas colunas aditivas/nullable, nenhum
-- dado existente é afetado. Ver docs/zhivago-especificacao-completa-crm-cadastro-imoveis-pagina-publica.md.

-- Localização estruturada (seção 62)
ALTER TABLE "Listing" ADD COLUMN "cep" TEXT;
ALTER TABLE "Listing" ADD COLUMN "logradouro" TEXT;
ALTER TABLE "Listing" ADD COLUMN "numero" TEXT;
ALTER TABLE "Listing" ADD COLUMN "complemento" TEXT;
ALTER TABLE "Listing" ADD COLUMN "bairro" TEXT;
ALTER TABLE "Listing" ADD COLUMN "cidade" TEXT;
ALTER TABLE "Listing" ADD COLUMN "uf" TEXT;

-- Diária: estadia mínima (seção 5/49)
ALTER TABLE "Listing" ADD COLUMN "minimumNights" INTEGER;

-- Venda (seção 5/66) — condoFee também é usado por MONTHLY_RENT (seção 5/67)
ALTER TABLE "Listing" ADD COLUMN "condoFee" DOUBLE PRECISION;
ALTER TABLE "Listing" ADD COLUMN "iptuAnnual" DOUBLE PRECISION;
ALTER TABLE "Listing" ADD COLUMN "acceptsFinancing" BOOLEAN DEFAULT false;
ALTER TABLE "Listing" ADD COLUMN "acceptsExchange" BOOLEAN DEFAULT false;

-- Aluguel mensal (seção 5/67)
ALTER TABLE "Listing" ADD COLUMN "iptuMonthly" DOUBLE PRECISION;
ALTER TABLE "Listing" ADD COLUMN "availableFrom" TIMESTAMP(3);
ALTER TABLE "Listing" ADD COLUMN "minimumLeaseMonths" INTEGER;
ALTER TABLE "Listing" ADD COLUMN "guaranteeTypes" TEXT;
ALTER TABLE "Listing" ADD COLUMN "isFurnished" BOOLEAN DEFAULT false;
ALTER TABLE "Listing" ADD COLUMN "allowPets" BOOLEAN DEFAULT true;
