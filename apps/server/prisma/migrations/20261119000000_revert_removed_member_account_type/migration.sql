-- Contas que viraram AGENCY só por entrar numa imobiliária (convite/pedido, sem CNPJ próprio)
-- e depois foram removidas da equipe voltam a ser contas pessoais.
UPDATE "User" u
SET "accountType" = 'INDIVIDUAL'
WHERE u."accountType" = 'AGENCY'
  AND u."document" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "OrganizationMember" m
    WHERE m."userId" = u."id" AND m."status" = 'ACTIVE'
  );
