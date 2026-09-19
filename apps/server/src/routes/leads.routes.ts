import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middlewares/authenticate.js';
import { requireOrgRole } from '../lib/organizations.js';
import {
  getOrganizationLeads,
  getMyLeads,
  assignLeadHandler,
  updateLeadStatusHandler,
  getLeadDetail,
  addInteractionHandler,
  scheduleVisitHandler,
  updateVisitStatusHandler,
} from '../controllers/leads.controller.js';

export async function leadsRoutes(app: FastifyInstance): Promise<void> {
  // GET /leads — todos os leads da organização, filtro opcional ?status= (requer OWNER/ADMIN/MANAGER/ASSISTANT)
  app.get(
    '/leads',
    { preHandler: [authenticate, requireOrgRole('OWNER', 'ADMIN', 'MANAGER', 'ASSISTANT')] },
    getOrganizationLeads
  );

  // GET /leads/mine — leads atualmente atribuídos a mim (requer pertencer a uma organização)
  app.get('/leads/mine', { preHandler: [authenticate] }, getMyLeads);

  // PATCH /leads/:id/assign — atribuir/reatribuir um lead a um corretor (requer OWNER/ADMIN/MANAGER)
  app.patch(
    '/leads/:id/assign',
    { preHandler: [authenticate, requireOrgRole('OWNER', 'ADMIN', 'MANAGER')] },
    assignLeadHandler
  );

  // PATCH /leads/:id/status — atualizar status (OWNER/ADMIN/MANAGER: qualquer lead; BROKER: só o seu)
  app.patch('/leads/:id/status', { preHandler: [authenticate] }, updateLeadStatusHandler);

  // GET /leads/:id — detalhe do lead (histórico de atribuição, interações, visitas) — inclui ASSISTANT
  app.get('/leads/:id', { preHandler: [authenticate] }, getLeadDetail);

  // POST /leads/:id/interactions — registrar contato (ligação, WhatsApp, e-mail, nota, visita) — mesma regra
  app.post('/leads/:id/interactions', { preHandler: [authenticate] }, addInteractionHandler);

  // POST /leads/:id/visits — agendar visita (exige atribuição aberta) — mesma regra
  app.post('/leads/:id/visits', { preHandler: [authenticate] }, scheduleVisitHandler);

  // PATCH /visits/:id/status — atualizar status de uma visita — mesma regra, aplicada ao lead da visita
  app.patch('/visits/:id/status', { preHandler: [authenticate] }, updateVisitStatusHandler);
}
