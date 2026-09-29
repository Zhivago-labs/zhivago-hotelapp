import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middlewares/authenticate.js';
import {
  createOffer,
  createNegotiationRound,
  getConversationNegotiations,
  acceptOffer,
  rejectOffer,
  withdrawOffer,
} from '../controllers/offers.controller.js';

export async function offersRoutes(app: FastifyInstance): Promise<void> {
  // Negociação de valor no chat (lib/negotiations.ts)
  app.get('/conversations/:id/negotiations', { preHandler: [authenticate] }, getConversationNegotiations);
  app.post('/conversations/:id/negotiations/rounds', { preHandler: [authenticate] }, createNegotiationRound);
  app.patch('/offers/:id/accept', { preHandler: [authenticate] }, acceptOffer);
  app.patch('/offers/:id/withdraw', { preHandler: [authenticate] }, withdrawOffer);

  // Fluxo antigo (app mobile) — mesmas regras, via proposeRound/respondToRound.
  app.post('/listings/:id/offers', { preHandler: [authenticate] }, createOffer);
  app.patch('/offers/:id/approve', { preHandler: [authenticate] }, acceptOffer);
  app.patch('/offers/:id/reject', { preHandler: [authenticate] }, rejectOffer);
}
