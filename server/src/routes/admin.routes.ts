import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middlewares/authenticate.js';
import { requireAdmin } from '../middlewares/requireAdmin.js';
import {
  getStats,
  getAllUsers,
  updateUserStatus,
  updateUserRole,
  adminGetListings,
  approveListing,
  pendingListing,
  rejectListing,
  adminDeleteListing,
} from '../controllers/admin.controller.js';

const preHandler = [authenticate, requireAdmin];

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  // GET /admin/stats — métricas gerais
  app.get('/admin/stats', { preHandler }, getStats);

  // GET /admin/users — lista todos os usuários
  app.get('/admin/users', { preHandler }, getAllUsers);

  // PATCH /admin/users/:id/status — suspender/banir/ativar usuário
  app.patch('/admin/users/:id/status', { preHandler }, updateUserStatus);

  // PATCH /admin/users/:id/role — promover/rebaixar usuário
  app.patch('/admin/users/:id/role', { preHandler }, updateUserRole);

  // GET /admin/listings — todos os imóveis com filtro de status
  app.get('/admin/listings', { preHandler }, adminGetListings);

  // PATCH /admin/listings/:id/approve — aprovar publicação
  app.patch('/admin/listings/:id/approve', { preHandler }, approveListing);

  // PATCH /admin/listings/:id/pending — voltar para pendente
  app.patch('/admin/listings/:id/pending', { preHandler }, pendingListing);

  // PATCH /admin/listings/:id/reject — rejeitar publicação
  app.patch('/admin/listings/:id/reject', { preHandler }, rejectListing);

  // DELETE /admin/listings/:id — remover publicação
  app.delete('/admin/listings/:id', { preHandler }, adminDeleteListing);
}
