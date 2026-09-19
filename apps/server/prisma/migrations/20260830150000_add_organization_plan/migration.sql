-- Billing mock (sem processador de pagamento real): Organization.plan (FREE padrão | PRO).
ALTER TABLE "Organization" ADD COLUMN "plan" TEXT NOT NULL DEFAULT 'FREE';
