import type { FastifyRequest } from 'fastify';
import type { Prisma } from '@prisma/client';
import type { OrganizationMember } from '@prisma/client';
import { getMembership } from './organizations.js';

export const WORKSPACE_READ_ALL = ['OWNER', 'ADMIN', 'MANAGER', 'ASSISTANT'];
export async function workspaceMembership(request: FastifyRequest) {
  const member = await getMembership((request.user as { id: string }).id);
  return member?.status === 'ACTIVE' ? member : null;
}
export function workspaceLeadScope(member: OrganizationMember): Prisma.LeadWhereInput {
  return { organizationId: member.organizationId,
    ...(!WORKSPACE_READ_ALL.includes(member.role) ? { assignments: { some: { brokerId: member.id, unassignedAt: null } } } : {}),
  };
}
export function workspaceListingScope(member: OrganizationMember): Prisma.ListingWhereInput {
  return { organizationId: member.organizationId,
    ...(!WORKSPACE_READ_ALL.includes(member.role) ? { agentId: member.userId } : {}),
  };
}
