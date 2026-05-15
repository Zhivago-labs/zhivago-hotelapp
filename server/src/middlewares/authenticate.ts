import type { FastifyRequest, FastifyReply } from 'fastify';

/**
 * Middleware de autenticação JWT.
 * Verifica o token e injeta `request.user` com { id, email, role }.
 * Use como preHandler em qualquer rota protegida.
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
}
