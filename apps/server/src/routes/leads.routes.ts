import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middlewares/authenticate.js';
import { requireOrgRole } from '../lib/organizations.js';
import {
  getOrganizationLeads,
  getMyLeads,
  assignLeadHandler,
  updateLeadStatusHandler,
  reopenLeadHandler,
  getLeadDetail,
  addInteractionHandler,
  scheduleVisitHandler,
  updateVisitStatusHandler,
  addTaskHandler,
  updateTaskHandler,
  getUnassignedQueue,
  getLeadAssignees,
  getTransferPreview,
  claimLeadHandler,
  bulkAssignHandler,
  registerLeadHandler,
  recordChannelIntentHandler,
} from '../controllers/leads.controller.js';

export async function leadsRoutes(app: FastifyInstance): Promise<void> {
  const manage = { preHandler: [authenticate, requireOrgRole('OWNER', 'ADMIN', 'MANAGER')] };

  // Carteira com escopo por papel (Kanban) — mesmos filtros de Contatos.
  app.get('/leads/workspace', { preHandler: [authenticate] }, getOrganizationLeads);
  // GET /leads — visão ampla (OWNER/ADMIN/MANAGER/ASSISTANT)
  app.get('/leads', { preHandler: [authenticate, requireOrgRole('OWNER', 'ADMIN', 'MANAGER', 'ASSISTANT')] }, getOrganizationLeads);
  app.get('/leads/mine', { preHandler: [authenticate] }, getMyLeads);

  // Fila "Sem responsável" (gestão; assistente lê) e responsáveis elegíveis (definição única).
  app.get('/leads/queue', { preHandler: [authenticate] }, getUnassignedQueue);
  app.get('/leads/assignees', { preHandler: [authenticate] }, getLeadAssignees);

  // Registro de entrada pela equipe e intenção por canal externo (cliente logado).
  app.post('/leads', { preHandler: [authenticate] }, registerLeadHandler);
  app.post('/leads/intent', { preHandler: [authenticate], config: { rateLimit: { max: 30, timeWindow: '15 minutes' } } }, recordChannelIntentHandler);
  app.post('/leads/bulk-assign', manage, bulkAssignHandler);

  // Atribuição / transferência (motivo obrigatório ao trocar) / assumir da fila.
  app.patch('/leads/:id/assign', manage, assignLeadHandler);
  app.get('/leads/:id/transfer-preview', manage, getTransferPreview);
  app.post('/leads/:id/claim', manage, claimLeadHandler);

  // Etapa (LOST exige motivo; sair de WON/LOST só por /reopen).
  app.patch('/leads/:id/status', { preHandler: [authenticate] }, updateLeadStatusHandler);
  app.post('/leads/:id/reopen', { preHandler: [authenticate] }, reopenLeadHandler);

  app.get('/leads/:id', { preHandler: [authenticate] }, getLeadDetail);
  app.post('/leads/:id/interactions', { preHandler: [authenticate] }, addInteractionHandler);
  app.post('/leads/:id/visits', { preHandler: [authenticate] }, scheduleVisitHandler);
  app.patch('/visits/:id/status', { preHandler: [authenticate] }, updateVisitStatusHandler);
  app.post('/leads/:id/tasks', { preHandler: [authenticate] }, addTaskHandler);
  app.patch('/tasks/:id', { preHandler: [authenticate] }, updateTaskHandler);
}
