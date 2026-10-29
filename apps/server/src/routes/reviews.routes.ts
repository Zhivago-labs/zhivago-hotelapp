import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middlewares/authenticate.js';
import { createReview, getReviews, getMyReviewEligibility } from '../controllers/reviews.controller.js';

export async function reviewsRoutes(app: FastifyInstance): Promise<void> {
  app.post('/listings/:id/reviews', { preHandler: [authenticate] }, createReview);
  app.get('/listings/:id/reviews', getReviews);
  // Se o usuário logado pode avaliar agora (estadia finalizada e ainda não avaliada)
  app.get('/listings/:id/reviews/eligibility', { preHandler: [authenticate] }, getMyReviewEligibility);
}
