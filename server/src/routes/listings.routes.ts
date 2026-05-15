import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middlewares/authenticate.js';
import {
  getListings,
  createListing,
  getMyListings,
  updateListing,
  deleteListing,
  getListingById,
} from '../controllers/listings.controller.js';

export async function listingsRoutes(app: FastifyInstance): Promise<void> {
  // GET /listings — lista imóveis aprovados (público)
  app.get('/listings', getListings);

  // GET /listings/:id — detalhe do imóvel (público)
  app.get('/listings/:id', getListingById);

  // POST /listings — cria imóvel (requer auth)
  app.post('/listings', { preHandler: [authenticate] }, createListing);

  // GET /me/listings — meus imóveis (requer auth)
  app.get('/me/listings', { preHandler: [authenticate] }, getMyListings);

  // PUT /listings/:id — editar meu imóvel (requer auth)
  app.put('/listings/:id', { preHandler: [authenticate] }, updateListing);

  // DELETE /listings/:id — remover imóvel (requer auth + ser dono ou admin)
  app.delete('/listings/:id', { preHandler: [authenticate] }, deleteListing);
}
