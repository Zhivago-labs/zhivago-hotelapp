import type { FastifyInstance } from 'fastify';
import { getUserProfile, getMyStats, getMyBookings, updatePushToken, getReceivedBookings } from '../controllers/users.controller.js';
import { authenticate } from '../middlewares/authenticate.js';

export async function usersRoutes(app: FastifyInstance): Promise<void> {
  // GET /users/me/stats - ESTATÍSTICAS DO USUÁRIO
  app.get('/users/me/stats', { preHandler: [authenticate] }, getMyStats);

  // GET /users/me/bookings - MINHAS VIAGENS (HÓSPEDE)
  app.get('/users/me/bookings', { preHandler: [authenticate] }, getMyBookings);

  // PATCH /users/me/push-token - ATUALIZAR TOKEN PUSH
  app.patch('/users/me/push-token', { preHandler: [authenticate] }, updatePushToken);

  // GET /users/me/received-bookings - RESERVAS RECEBIDAS (ANFITRIÃO)
  app.get('/users/me/received-bookings', { preHandler: [authenticate] }, getReceivedBookings);

  // GET /users/:id — detalhe do perfil do usuário e seus imóveis
  app.get('/users/:id', getUserProfile);
}
