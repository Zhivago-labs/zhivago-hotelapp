import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middlewares/authenticate.js';
import { requireOrgRole } from '../lib/organizations.js';
import {
  createOrganization,
  getMyOrganization,
  inviteMember,
  listMyInvites,
  listOrganizationInvites,
  acceptInvite,
  declineInvite,
  cancelInvite,
  removeMember,
  getOrganizationListings,
  getMyAssignedListings,
  updateLeadDistributionMode,
  getOrganizationMetrics,
  updateMemberReceiveLeads,
  listOrganizationBuildings,
  createOrganizationBuilding,
  updateOrganizationBuilding,
  setBuildingLeadOwner,
  setBuildingBackup,
  getOrganizationAuditLog,
} from '../controllers/organizations.controller.js';

export async function organizationsRoutes(app: FastifyInstance): Promise<void> {
  // POST /organizations — criar organização (requer auth + conta Imobiliária, opt-in)
  app.post('/organizations', { preHandler: [authenticate] }, createOrganization);

  // GET /organizations/me — minha organização e meu papel nela (requer auth)
  app.get('/organizations/me', { preHandler: [authenticate] }, getMyOrganization);

  // GET /organizations/invites/me — meus convites pendentes, pelo e-mail da conta logada
  app.get('/organizations/invites/me', { preHandler: [authenticate] }, listMyInvites);

  // POST /organizations/invites — convidar membro por e-mail (requer OWNER/ADMIN)
  app.post(
    '/organizations/invites',
    { preHandler: [authenticate, requireOrgRole('OWNER', 'ADMIN')] },
    inviteMember
  );

  // GET /organizations/invites — convites pendentes da organização (requer OWNER/ADMIN)
  app.get(
    '/organizations/invites',
    { preHandler: [authenticate, requireOrgRole('OWNER', 'ADMIN')] },
    listOrganizationInvites
  );

  // POST /organizations/invites/:token/accept — aceitar convite (requer auth, e-mail deve bater)
  app.post('/organizations/invites/:token/accept', { preHandler: [authenticate] }, acceptInvite);

  // POST /organizations/invites/:token/decline — recusar convite (requer auth, e-mail deve bater)
  app.post('/organizations/invites/:token/decline', { preHandler: [authenticate] }, declineInvite);

  // DELETE /organizations/invites/:id — cancelar convite pendente (requer OWNER/ADMIN)
  app.delete(
    '/organizations/invites/:id',
    { preHandler: [authenticate, requireOrgRole('OWNER', 'ADMIN')] },
    cancelInvite
  );

  // DELETE /organizations/members/:userId — remover membro (requer OWNER/ADMIN)
  app.delete(
    '/organizations/members/:userId',
    { preHandler: [authenticate, requireOrgRole('OWNER', 'ADMIN')] },
    removeMember
  );

  // GET /organizations/listings — todos os imóveis da organização (requer OWNER/ADMIN/MANAGER/ASSISTANT)
  app.get(
    '/organizations/listings',
    { preHandler: [authenticate, requireOrgRole('OWNER', 'ADMIN', 'MANAGER', 'ASSISTANT')] },
    getOrganizationListings
  );

  // GET /organizations/my-assigned-listings — imóveis atribuídos a mim (requer pertencer a uma organização)
  app.get(
    '/organizations/my-assigned-listings',
    { preHandler: [authenticate] },
    getMyAssignedListings
  );

  // PATCH /organizations/lead-distribution-mode — MANUAL ou ROUND_ROBIN (requer OWNER/ADMIN)
  app.patch(
    '/organizations/lead-distribution-mode',
    { preHandler: [authenticate, requireOrgRole('OWNER', 'ADMIN')] },
    updateLeadDistributionMode
  );

  // GET /organizations/metrics — métricas do CRM (requer OWNER/ADMIN/MANAGER/ASSISTANT)
  app.get(
    '/organizations/metrics',
    { preHandler: [authenticate, requireOrgRole('OWNER', 'ADMIN', 'MANAGER', 'ASSISTANT')] },
    getOrganizationMetrics
  );

  // PATCH /organizations/members/:userId/receive-leads — opt-out de receber leads (o próprio
  // membro, ou OWNER/ADMIN em nome de outro — auth própria dentro do handler)
  app.patch(
    '/organizations/members/:userId/receive-leads',
    { preHandler: [authenticate] },
    updateMemberReceiveLeads
  );

  // GET /organizations/buildings — empreendimentos da organização (qualquer membro ativo, pra
  // escolher um no cadastro de imóvel)
  app.get(
    '/organizations/buildings',
    { preHandler: [authenticate, requireOrgRole('OWNER', 'ADMIN', 'MANAGER', 'BROKER', 'ASSISTANT')] },
    listOrganizationBuildings
  );

  // POST /organizations/buildings — criar empreendimento (requer poder criar/editar imóvel:
  // OWNER/ADMIN/BROKER — MANAGER não cria/edita imóvel, mesma regra de `canManageOrgListing`)
  app.post(
    '/organizations/buildings',
    { preHandler: [authenticate, requireOrgRole('OWNER', 'ADMIN', 'BROKER')] },
    createOrganizationBuilding
  );

  // PATCH /organizations/buildings/:id — renomear/editar endereço (mesma regra de criar)
  app.patch(
    '/organizations/buildings/:id',
    { preHandler: [authenticate, requireOrgRole('OWNER', 'ADMIN', 'BROKER')] },
    updateOrganizationBuilding
  );

  // PATCH /organizations/buildings/:id/lead-owner — atribuir/transferir Lead Owner (seção 75:
  // só quem gerencia a organização pode transferir, mesmo se já houver um dono)
  app.patch(
    '/organizations/buildings/:id/lead-owner',
    { preHandler: [authenticate, requireOrgRole('OWNER', 'ADMIN')] },
    setBuildingLeadOwner
  );

  // PATCH /organizations/buildings/:id/backup — definir backup do empreendimento (seção 17)
  app.patch(
    '/organizations/buildings/:id/backup',
    { preHandler: [authenticate, requireOrgRole('OWNER', 'ADMIN')] },
    setBuildingBackup
  );

  // GET /organizations/audit-log — log de auditoria da organização (seção 125, requer OWNER/ADMIN)
  app.get(
    '/organizations/audit-log',
    { preHandler: [authenticate, requireOrgRole('OWNER', 'ADMIN')] },
    getOrganizationAuditLog
  );
}
