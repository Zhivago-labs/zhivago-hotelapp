import type { FastifyRequest, FastifyReply } from 'fastify';

/**
 * Middleware de autorização para admins.
 * Deve ser usado APÓS o middleware `authenticate`.
 */
export async function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const user = request.user as { role: string };
  if (user.role !== 'ADMIN') {
    return reply.status(403).send({ error: 'Acesso restrito a administradores.' });
  }
}
