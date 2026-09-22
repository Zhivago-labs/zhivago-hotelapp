// Tipos e constantes compartilhados entre apps/mobile, apps/web e apps/server.
// Mantido em sincronia manual com server/prisma/schema.prisma — não é gerado automaticamente.

export type UserRole = 'USER' | 'ADMIN';
export type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'BANNED';
export type AccountType = 'INDIVIDUAL' | 'AGENCY';

export type ListingType = 'casa' | 'apartamento';
export type ListingCategory = 'aluguel' | 'venda';
export type BillingCycle = 'noite' | 'mês';
export type ListingStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'REMOVED' | 'SOLD';
// Operação comercial explícita (seção 3 da spec de refatoração) — fonte principal a partir da
// qual o domínio deve trabalhar. category/billingCycle continuam por compatibilidade.
export type ListingOperationType = 'SALE' | 'MONTHLY_RENT' | 'DAILY_RENT';

export type BookingStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'REJECTED';

export type MessageType =
  | 'TEXT'
  | 'BOOKING_REQUEST'
  | 'BOOKING_APPROVED'
  | 'BOOKING_REJECTED'
  | 'OFFER_REQUEST'
  | 'OFFER_APPROVED'
  | 'OFFER_REJECTED';

export type NotificationType = 'INFO' | 'MESSAGE' | 'BOOKING' | 'SYSTEM';

export type OfferStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED';

// B2B (Organization/OrganizationMember) — evoluído de Company/CompanyMember (Fase B) em
// 2026-08-30, ver docs/crm-b2b-organizacoes-leads.md.
export type OrganizationMemberRole = 'OWNER' | 'ADMIN' | 'MANAGER' | 'BROKER' | 'ASSISTANT';
export type OrganizationMemberStatus = 'ACTIVE' | 'INACTIVE';
export type OrganizationType = 'AGENCY' | 'INDIVIDUAL';
export type LeadDistributionMode = 'MANUAL' | 'ROUND_ROBIN';

export interface OrganizationMemberUser {
  id: string;
  name: string;
  email: string;
  avatar: string | null;
}

export interface OrganizationMember {
  id: string;
  role: OrganizationMemberRole;
  status: OrganizationMemberStatus;
  receiveLeads: boolean;
  userId: string;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
  user?: OrganizationMemberUser;
}

export interface Organization {
  id: string;
  name: string;
  type: OrganizationType;
  document: string;
  email: string | null;
  phone: string | null;
  logo: string | null;
  description: string | null;
  verified: boolean;
  leadDistributionMode: LeadDistributionMode;
  createdAt: string;
  updatedAt: string;
  members: OrganizationMember[];
}

// Empreendimento (seção 8 da spec de refatoração do cadastro) — agrupa Listings de uma mesma
// organização sob um responsável exclusivo por Leads (leadOwner), com um backup opcional.
export interface OrganizationBuilding {
  id: string;
  name: string;
  address: string | null;
  organizationId: string;
  leadOwnerMemberId: string | null;
  backupMemberId: string | null;
  createdAt: string;
  updatedAt: string;
  leadOwner: OrganizationMember | null;
  backupMember: OrganizationMember | null;
  _count: { listings: number };
}

export interface OrganizationInvite {
  id: string;
  organizationId: string;
  email: string;
  role: OrganizationMemberRole;
  invitedBy: string;
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string;
  organization?: { id: string; name: string; logo: string | null };
  // Só presente em `GET /organizations/invites/me` (o próprio convidado) — a listagem de
  // gestão (`GET /organizations/invites`, OWNER/ADMIN) não expõe o token de ninguém.
  token?: string;
}

export interface ListingOwner {
  id: string;
  name: string;
  avatar: string | null;
  email?: string;
  phone?: string | null;
  accountType?: AccountType;
  companyName?: string | null;
  creci?: string | null;
  verified?: boolean;
}

export interface ListingImage {
  id: string;
  url: string;
  order: number;
}

// CRM B2B — Fase 2 (ver docs/crm-b2b-organizacoes-leads.md): Lead nasce quando um usuário
// demonstra interesse (hoje: abre conversa) num imóvel de organização.
export type LeadStatus =
  | 'NEW'
  | 'CONTACTED'
  | 'QUALIFIED'
  | 'VISIT_SCHEDULED'
  | 'PROPOSAL'
  | 'NEGOTIATION'
  | 'WON'
  | 'LOST';

export interface LeadAssignment {
  id: string;
  leadId: string;
  brokerId: string;
  assignedBy: string | null;
  assignedAt: string;
  firstContactAt: string | null;
  unassignedAt: string | null;
  reason: string | null;
  broker?: OrganizationMember;
}

// CRM B2B — Fase 4: SLA é só cálculo sob demanda (nunca persistido) a partir de assignedAt/
// firstContactAt. UNASSIGNED = sem atribuição; ON_TIME cobre "recém atribuído" e "já contatado".
export type SlaStatus = 'UNASSIGNED' | 'ON_TIME' | 'AT_RISK' | 'OVERDUE';

// Tarefa/próxima ação (seção 112/117 da spec) — puramente uma checklist com prazo, sem
// lembrete/automação proativa.
export interface LeadTask {
  id: string;
  leadId: string;
  memberId: string;
  title: string;
  dueAt: string | null;
  completedAt: string | null;
  createdAt: string;
  member?: OrganizationMember;
}

export interface Lead {
  id: string;
  status: LeadStatus;
  source: string;
  userId: string;
  listingId: string;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
  user: OrganizationMemberUser;
  listing: { id: string; name: string; images: { url: string }[] };
  // Só a atribuição aberta (unassignedAt null) — histórico completo fica no backend, não exposto aqui.
  assignments: LeadAssignment[];
  // Só a tarefa incompleta mais próxima do prazo ("próxima ação") — histórico completo só no detalhe.
  tasks: LeadTask[];
  slaStatus: SlaStatus;
}

// `GET /leads` (org-wide) agora pagina e filtra no servidor (seção 118/119 da spec).
export interface PaginatedLeads {
  items: Lead[];
  total: number;
  page: number;
  limit: number;
}

// CRM B2B — Fase 3: log de contato (LeadInteraction) e agendamento estruturado (Visit).
export type LeadInteractionType = 'PHONE_CALL' | 'WHATSAPP' | 'EMAIL' | 'NOTE' | 'VISIT' | 'STATUS_CHANGE';
export type VisitStatus = 'SCHEDULED' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';

export interface LeadInteraction {
  id: string;
  leadId: string;
  memberId: string;
  type: LeadInteractionType;
  content: string | null;
  createdAt: string;
  member?: OrganizationMember;
}

export interface Visit {
  id: string;
  leadId: string;
  brokerId: string;
  scheduledAt: string;
  status: VisitStatus;
  notes: string | null;
  createdAt: string;
  broker?: OrganizationMember;
}

// Página de detalhe do lead (`GET /leads/:id`) — histórico completo, diferente da listagem (Kanban)
// que só traz a atribuição aberta.
export interface LeadDetail extends Omit<Lead, 'assignments' | 'tasks'> {
  assignmentHistory: LeadAssignment[];
  interactions: LeadInteraction[];
  visits: Visit[];
  tasks: LeadTask[];
}

// Log de auditoria da organização (seção 125 da spec) — responsabilidade de empreendimento e
// moderação de imóvel; transferência/atribuição de Lead já é auditada pelo próprio histórico de
// `LeadAssignment` (assignedBy/reason/source), não duplicado aqui.
export type OrgAuditAction =
  | 'BUILDING_LEAD_OWNER_CHANGED'
  | 'BUILDING_BACKUP_CHANGED'
  | 'LISTING_ORG_APPROVED'
  | 'LISTING_ORG_REJECTED';

export interface OrganizationAuditLogEntry {
  id: string;
  organizationId: string;
  actorMemberId: string;
  action: OrgAuditAction;
  entityType: 'BUILDING' | 'LISTING';
  entityId: string;
  reason: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  actor: OrganizationMember;
}

export interface PaginatedAuditLog {
  items: OrganizationAuditLogEntry[];
  total: number;
  page: number;
  limit: number;
}

// CRM B2B — Fase 4: métricas agregadas da organização (`GET /organizations/metrics`).
export interface OrganizationBrokerMetrics {
  memberId: string;
  name: string;
  assignedCount: number;
  wonCount: number;
  avgResponseHours: number | null;
}

export interface OrganizationMetrics {
  totalLeads: number;
  wonCount: number;
  lostCount: number;
  conversionRate: number;
  avgResponseHours: number | null;
  slaCompliancePct: number | null;
  funnelCounts: { status: LeadStatus; count: number }[];
  leadsPerMonth: { label: string; value: number }[];
  byBroker: OrganizationBrokerMetrics[];
}

export interface Listing {
  id: string;
  name: string;
  description: string | null;
  price: number;
  originalPrice?: number | null;
  type: ListingType;
  category: ListingCategory;
  billingCycle: BillingCycle | null;
  operationType: ListingOperationType;
  images: ListingImage[];
  location: string;
  // Localização estruturada (seção 62 da spec de refatoração do cadastro).
  cep?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  uf?: string | null;
  bedrooms: number;
  suites?: number;
  bathrooms: number;
  parking: number;
  privateArea?: number | null;
  totalArea?: number | null;
  amenities?: string | null;
  checkInTime?: string | null;
  checkOutTime?: string | null;
  customMaxGuests?: number | null;
  minimumNights?: number | null;
  cleaningFee?: number | null;
  houseRules?: string | null;
  safetyItems?: string | null;
  cancellationPolicy?: string | null;
  // Condições de VENDA/ALUGUEL MENSAL (seções 66/67 da spec de refatoração do cadastro).
  condoFee?: number | null;
  iptuAnnual?: number | null;
  acceptsFinancing?: boolean | null;
  acceptsExchange?: boolean | null;
  iptuMonthly?: number | null;
  availableFrom?: string | null;
  minimumLeaseMonths?: number | null;
  guaranteeTypes?: string | null;
  isFurnished?: boolean | null;
  allowPets?: boolean | null;
  status: ListingStatus;
  viewCount: number;
  ownerId: string | null;
  owner: ListingOwner | null;
  // B2B (Organization) — paralelo a ownerId, nunca ambos preenchidos.
  organizationId?: string | null;
  agentId?: string | null;
  createdById?: string | null;
  buildingId?: string | null;
  organization?: { id: string; name: string; logo: string | null; verified: boolean } | null;
  agent?: { id: string; name: string; avatar: string | null } | null;
  createdAt: string;
  updatedAt: string;
}
