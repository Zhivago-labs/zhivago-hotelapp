-- Billing mock removido a pedido explícito do usuário logo depois de implementado ("pq os leads é
-- pra qm paga quero isso não uai" — não faz sentido travar o CRM atrás de pagamento). CRM volta a
-- ser liberado pra qualquer organização, sem limite de corretores por plano.
ALTER TABLE "Organization" DROP COLUMN "plan";
