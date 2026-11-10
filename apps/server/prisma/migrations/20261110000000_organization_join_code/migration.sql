-- Código de convite por imobiliária + pedidos para entrar (aprovados pelo OWNER/ADMIN).
-- Só adiciona coluna e tabela novas; nenhum dado existente é alterado.
ALTER TABLE "Organization" ADD COLUMN "joinCode" TEXT;
CREATE UNIQUE INDEX "Organization_joinCode_key" ON "Organization"("joinCode");

CREATE TABLE "OrganizationJoinRequest" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrganizationJoinRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OrganizationJoinRequest_organizationId_status_idx" ON "OrganizationJoinRequest"("organizationId", "status");
CREATE INDEX "OrganizationJoinRequest_userId_status_idx" ON "OrganizationJoinRequest"("userId", "status");

ALTER TABLE "OrganizationJoinRequest" ADD CONSTRAINT "OrganizationJoinRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrganizationJoinRequest" ADD CONSTRAINT "OrganizationJoinRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
