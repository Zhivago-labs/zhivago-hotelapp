import type { FastifyReply, FastifyRequest } from 'fastify';
import { randomBytes } from 'node:crypto';
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
