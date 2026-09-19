import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middlewares/authenticate.js';
import {
  getListings,
  createListing,
  getMyListings,
  updateListing,
  deleteListing,
  duplicateListing,
  getListingById,
  importListings,
  reassignListingAgent,
  approveOrgListing,
  rejectOrgListing,
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

  // POST /listings/:id/duplicate — duplicar imóvel como rascunho (requer auth + ser dono ou admin)
  app.post('/listings/:id/duplicate', { preHandler: [authenticate] }, duplicateListing);

  // POST /listings/import — importar vários imóveis via CSV como rascunho (requer auth + conta Imobiliária)
  app.post('/listings/import', { preHandler: [authenticate] }, importListings);

  // PATCH /listings/:id/agent — reatribuir corretor responsável (requer auth + ser OWNER da empresa)
  app.patch('/listings/:id/agent', { preHandler: [authenticate] }, reassignListingAgent);

  // PATCH /listings/:id/org-approve — aprovar imóvel de organização (requer OWNER/ADMIN da organização)
  app.patch('/listings/:id/org-approve', { preHandler: [authenticate] }, approveOrgListing);

  // PATCH /listings/:id/org-reject — rejeitar imóvel de organização (requer OWNER/ADMIN da organização)
  app.patch('/listings/:id/org-reject', { preHandler: [authenticate] }, rejectOrgListing);
}
