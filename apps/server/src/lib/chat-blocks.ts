import { prisma } from './prisma.js';

/** Mensagem única mostrada a quem tenta falar com alguém do par bloqueado (nunca diz quem bloqueou). */
export const CHAT_BLOCKED_MESSAGE = 'Não é possível enviar mensagens nesta conversa.';

/**
 * Bloqueios (ver model `ChatBlock`) que atingem um grupo de pessoas falando sobre um imóvel:
 * - pessoal entre quaisquer duas delas;
 * - a imobiliária do imóvel bloqueou alguma delas;
 * - alguma delas bloqueou a imobiliária do imóvel.
 * Vale nos dois sentidos — quem bloqueou também não consegue escrever.
 */
export function chatBlocksBetween(userIds: string[], organizationId: string | null) {
  const ids = [...new Set(userIds.filter(Boolean))];
  const or: object[] = [
    { blockerOrganizationId: null, blockedUserId: { in: ids }, blockerId: { in: ids } },
  ];
  if (organizationId) {
    or.push({ blockerOrganizationId: organizationId, blockedUserId: { in: ids } });
    or.push({ blockedOrganizationId: organizationId, blockerId: { in: ids } });
  }
  return prisma.chatBlock.findMany({ where: { OR: or }, orderBy: { createdAt: 'asc' } });
}

export async function isChatBlocked(userIds: string[], organizationId: string | null): Promise<boolean> {
  return (await chatBlocksBetween(userIds, organizationId)).length > 0;
}

/** Autor sempre desfaz; bloqueio feito em nome da imobiliária também pode ser desfeito por OWNER/ADMIN dela. */
export async function canRemoveChatBlock(
  userId: string,
  block: { blockerId: string; blockerOrganizationId: string | null }
): Promise<boolean> {
  if (block.blockerId === userId) return true;
  if (!block.blockerOrganizationId) return false;
  const member = await prisma.organizationMember.findUnique({ where: { userId } });
  return (
    !!member &&
    member.status === 'ACTIVE' &&
    member.organizationId === block.blockerOrganizationId &&
    ['OWNER', 'ADMIN'].includes(member.role)
  );
}
