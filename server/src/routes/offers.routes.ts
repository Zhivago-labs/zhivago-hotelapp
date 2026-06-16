import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middlewares/authenticate.js';
import { createOffer, approveOffer, rejectOffer } from '../controllers/offers.controller.js';

export async function offersRoutes(app: FastifyInstance): Promise<void> {
  app.post('/listings/:id/offers', { preHandler: [authenticate] }, createOffer);
  app.patch('/offers/:id/approve', { preHandler: [authenticate] }, approveOffer);
  app.patch('/offers/:id/reject', { preHandler: [authenticate] }, rejectOffer);
}
