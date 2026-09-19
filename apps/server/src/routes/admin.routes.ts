import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middlewares/authenticate.js';
import { requireAdmin } from '../middlewares/requireAdmin.js';
import {
  getStats,
  getAllUsers,
  updateUserStatus,
  updateUserRole,
  verifyUser,
  getAllOrganizations,
  verifyOrganization,
  adminGetListings,
  approveListing,
  pendingListing,
  rejectListing,
  adminDeleteListing,
} from '../controllers/admin.controller.js';
import {
  getAllBookings,
  forceCancelBooking,
  getAllOffers,
  getAllReviews,
  adminDeleteReview,
  broadcastNotification,
  getAdminActionLogs,
  getRevenueStats,
} from '../controllers/admin-moderation.controller.js';

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

  // PATCH /admin/users/:id/verify — verificar/desverificar conta de imobiliária
  app.patch('/admin/users/:id/verify', { preHandler }, verifyUser);

  // GET /admin/organizations — lista organizações (B2B) com filtro de verificação
  app.get('/admin/organizations', { preHandler }, getAllOrganizations);

  // PATCH /admin/organizations/:id/verify — verificar/desverificar organização (B2B)
  app.patch('/admin/organizations/:id/verify', { preHandler }, verifyOrganization);

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

  // GET /admin/bookings — todas as reservas com filtro de status/imóvel
  app.get('/admin/bookings', { preHandler }, getAllBookings);

  // PATCH /admin/bookings/:id/force-cancel — cancelar reserva (moderação/disputa)
  app.patch('/admin/bookings/:id/force-cancel', { preHandler }, forceCancelBooking);

  // GET /admin/offers — todas as propostas com filtro de status/imóvel
  app.get('/admin/offers', { preHandler }, getAllOffers);

  // GET /admin/reviews — todas as avaliações com filtro de imóvel
  app.get('/admin/reviews', { preHandler }, getAllReviews);

  // DELETE /admin/reviews/:id — remover avaliação (moderação)
  app.delete('/admin/reviews/:id', { preHandler }, adminDeleteReview);

  // POST /admin/notifications/broadcast — notificação em massa
  app.post('/admin/notifications/broadcast', { preHandler }, broadcastNotification);

  // GET /admin/logs — log de auditoria das ações do admin
  app.get('/admin/logs', { preHandler }, getAdminActionLogs);

  // GET /admin/revenue — volume transacionado (GMV) pela plataforma
  app.get('/admin/revenue', { preHandler }, getRevenueStats);
}
