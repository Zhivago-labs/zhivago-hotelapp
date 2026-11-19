-- Encerramento de conversa pela imobiliária
ALTER TABLE "Conversation" ADD COLUMN "closedBy" TEXT, ADD COLUMN "closedAt" TIMESTAMP(3);
-- Conversas já encerradas até hoje só podiam ter sido encerradas pela administração
UPDATE "Conversation" SET "closedBy" = 'ADMIN' WHERE "isClosed" = true;

-- Bloqueio de chat
CREATE TABLE "ChatBlock" (
    "id" TEXT NOT NULL,
    "blockerId" TEXT NOT NULL,
    "blockerOrganizationId" TEXT,
    "blockedUserId" TEXT,
    "blockedOrganizationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChatBlock_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ChatBlock_blockerId_idx" ON "ChatBlock"("blockerId");
CREATE INDEX "ChatBlock_blockedUserId_idx" ON "ChatBlock"("blockedUserId");
CREATE INDEX "ChatBlock_blockerOrganizationId_idx" ON "ChatBlock"("blockerOrganizationId");
CREATE INDEX "ChatBlock_blockedOrganizationId_idx" ON "ChatBlock"("blockedOrganizationId");
ALTER TABLE "ChatBlock" ADD CONSTRAINT "ChatBlock_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatBlock" ADD CONSTRAINT "ChatBlock_blockerOrganizationId_fkey" FOREIGN KEY ("blockerOrganizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatBlock" ADD CONSTRAINT "ChatBlock_blockedUserId_fkey" FOREIGN KEY ("blockedUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatBlock" ADD CONSTRAINT "ChatBlock_blockedOrganizationId_fkey" FOREIGN KEY ("blockedOrganizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
