import type { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../lib/prisma.js';

/**
 * Middleware de autenticação JWT com revalidação de estado.
 *
 * Além de verificar a assinatura do token, consulta o banco para garantir que:
 * 1. O usuário ainda existe.
 * 2. A conta está ativa (não suspensa/banida).
 * 3. O tokenVersion do JWT bate com o do banco (invalidação por troca de senha,
 *    mudança de role, ban, etc.).
 *
 * Injeta `request.user` com dados ATUAIS do banco, não os do JWT (que podem
 * estar desatualizados).
 */
export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    await request.jwtVerify();
  } catch {
    return reply.status(401).send({ error: 'Token inválido ou ausente.' });
  }

  const payload = request.user as { id: string; tokenVersion?: number };

  // Revalida estado atual do usuário no banco
  const user = await prisma.user.findUnique({
    where: { id: payload.id },
    select: { id: true, email: true, role: true, status: true, tokenVersion: true },
  });

  if (!user) {
    return reply.status(401).send({ error: 'Usuário não encontrado.' });
  }

  if (user.status !== 'ACTIVE') {
    return reply.status(403).send({ error: 'Conta suspensa ou banida. Entre em contato com o suporte.' });
  }

  // Verifica se o token foi emitido antes de uma ação de invalidação
  if (payload.tokenVersion !== undefined && payload.tokenVersion !== user.tokenVersion) {
    return reply.status(401).send({ error: 'Sessão expirada. Faça login novamente.' });
  }

  // Sobrescreve request.user com dados ATUAIS do banco
  (request as any).user = {
    id: user.id,
    email: user.email,
    role: user.role,
    status: user.status,
    tokenVersion: user.tokenVersion,
  };
}
