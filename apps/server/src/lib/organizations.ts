import type { FastifyReply, FastifyRequest } from 'fastify';
import { randomBytes } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from './prisma.js';

export const ORG_ROLES = ['OWNER', 'ADMIN', 'MANAGER', 'BROKER', 'ASSISTANT'] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

const INVITE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias

export function getMembership(userId: string) {
  return prisma.organizationMember.findUnique({ where: { userId } });
}

export function generateInviteToken(): string {
  return randomBytes(32).toString('hex');
}

export function inviteExpiresAt(): Date {
  return new Date(Date.now() + INVITE_EXPIRY_MS);
}

export type OrgAuditAction =
  | 'BUILDING_LEAD_OWNER_CHANGED'
  | 'BUILDING_BACKUP_CHANGED'
  | 'LISTING_ORG_APPROVED'
  | 'LISTING_ORG_REJECTED';

/**
 * Auditoria de ações estruturais do CRM B2B (seção 125 da spec) — responsabilidade de
 * empreendimento e moderação de imóvel de organização, que nem `AdminActionLog` (plataforma) nem
 * o histórico de `LeadAssignment` (já é o próprio log de atribuição de Lead) cobrem. Nunca lança:
 * é sempre um efeito colateral aditivo, igual ao resto do log de auditoria do projeto.
 */
export async function logOrgAudit(entry: {
  organizationId: string;
  actorMemberId: string;
  action: OrgAuditAction;
  entityType: 'BUILDING' | 'LISTING';
  entityId: string;
  reason?: string | undefined;
  metadata?: Prisma.InputJsonValue | undefined;
}): Promise<void> {
  try {
    await prisma.organizationAuditLog.create({
      data: {
        organizationId: entry.organizationId,
        actorMemberId: entry.actorMemberId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        reason: entry.reason ?? null,
        ...(entry.metadata !== undefined ? { metadata: entry.metadata } : {}),
      },
    });
  } catch (err) {
    console.error('Falha ao registrar log de auditoria da organização:', err);
  }
}

/**
 * Middleware de autorização por papel de organização — mesmo estilo do `requireAdmin` já
 * existente no projeto. Nunca confia em `organizationId` vindo do frontend: sempre busca o
 * `OrganizationMember` fresco no banco a partir do `userId` do JWT já autenticado.
 * Anexa `request.orgMembership` para os handlers que precisarem do papel/organização.
 */
export function requireOrgRole(...roles: OrgRole[]) {
  return async function (request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { id: userId } = request.user as { id: string };

    const membership = await getMembership(userId);
    if (!membership || membership.status !== 'ACTIVE') {
      reply.status(404).send({ error: 'Você não pertence a nenhuma organização.' });
      return;
    }
    if (!roles.includes(membership.role as OrgRole)) {
      reply.status(403).send({ error: 'Sem permissão para esta ação.' });
      return;
    }

    (request as FastifyRequest & { orgMembership?: typeof membership }).orgMembership = membership;
  };
}
