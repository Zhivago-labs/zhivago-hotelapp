import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middlewares/authenticate.js';
import { register, login, me, updateMe, updatePassword, forgotPassword, resetPassword } from '../controllers/auth.controller.js';

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // POST /auth/register — cadastro público
  app.post('/auth/register', register);

  // POST /auth/login — login público
  app.post('/auth/login', login);

  // GET /auth/me — perfil do usuário logado
  app.get('/auth/me', { preHandler: [authenticate] }, me);

  // PATCH /auth/me — atualizar perfil
  app.patch('/auth/me', { preHandler: [authenticate] }, updateMe);

  // PATCH /auth/password — atualizar senha
  app.patch('/auth/password', { preHandler: [authenticate] }, updatePassword);

  // POST /auth/forgot-password — pedir link/token de recuperação
  app.post('/auth/forgot-password', forgotPassword);

  // POST /auth/reset-password — redefinir com token
  app.post('/auth/reset-password', resetPassword);
}
