import assert from 'node:assert/strict';
import { test } from 'node:test';
import Fastify from 'fastify';

// Banco em memória com o subconjunto de `where` que Contatos usa (escopo do papel, etapa,
// sem responsável, userId/id in). Cenário principal: Ana tem duas negociações — Funcionários com
// Bruno e Savassi com Carla. Bruno não pode descobrir a de Carla nem por contagem.
type Lead = {
  id: string; userId: string; listingId: string; organizationId: string; status: string;
  source: string; createdAt: Date; lastActivityAt: Date; brokerId: string | null; conversationWith: string[];
};
const users = [
  { id: 'ana', name: 'Ana Ribeiro', email: 'ana@test', phone: '(31) 99999-0001' },
  { id: 'eva', name: 'Eva Lima', email: 'eva@test', phone: null },
  { id: 'diego', name: 'Diego Souza', email: 'diego@test', phone: null },
  { id: 'gil', name: 'Gil Nunes', email: 'gil@test', phone: null },
  ...Array.from({ length: 52 }, (_, i) => ({ id: `p${i}`, name: `Pessoa ${String(i).padStart(2, '0')}`, email: `p${i}@test`, phone: null })),
];
const members = [
  { id: 'm-gestor', userId: 'gestor', organizationId: 'org', role: 'MANAGER', status: 'ACTIVE', user: { name: 'Gestora' } },
  { id: 'm-bruno', userId: 'bruno', organizationId: 'org', role: 'BROKER', status: 'ACTIVE', user: { name: 'Bruno' } },
  { id: 'm-carla', userId: 'carla', organizationId: 'org', role: 'BROKER', status: 'ACTIVE', user: { name: 'Carla' } },
];
const listings: Record<string, { id: string; name: string }> = {
  func: { id: 'func', name: 'Apartamento Funcionários' },
  sav: { id: 'sav', name: 'Apartamento Savassi' },
  casa: { id: 'casa', name: 'Casa Pampulha' },
};
const at = (day: number) => new Date(Date.UTC(2026, 10, day, 12));
const leads: Lead[] = [
  // Savassi tem atividade mais recente que Funcionários: para a gestão ele é o imóvel principal.
  { id: 'l-ana-func', userId: 'ana', listingId: 'func', organizationId: 'org', status: 'CONTACTED', source: 'CHAT', createdAt: at(1), lastActivityAt: at(10), brokerId: 'm-bruno', conversationWith: ['ana', 'bruno'] },
  { id: 'l-ana-sav', userId: 'ana', listingId: 'sav', organizationId: 'org', status: 'VISIT_SCHEDULED', source: 'CHAT', createdAt: at(2), lastActivityAt: at(20), brokerId: 'm-carla', conversationWith: ['ana', 'carla'] },
  { id: 'l-eva-open', userId: 'eva', listingId: 'casa', organizationId: 'org', status: 'NEW', source: 'PHONE', createdAt: at(3), lastActivityAt: at(5), brokerId: 'm-bruno', conversationWith: [] },
  { id: 'l-eva-lost', userId: 'eva', listingId: 'func', organizationId: 'org', status: 'LOST', source: 'CHAT', createdAt: at(1), lastActivityAt: at(4), brokerId: 'm-bruno', conversationWith: [] },
  { id: 'l-diego-won', userId: 'diego', listingId: 'sav', organizationId: 'org', status: 'WON', source: 'CHAT', createdAt: at(1), lastActivityAt: at(3), brokerId: 'm-carla', conversationWith: [] },
  { id: 'l-gil-queue', userId: 'gil', listingId: 'casa', organizationId: 'org', status: 'NEW', source: 'CHAT', createdAt: at(6), lastActivityAt: at(6), brokerId: null, conversationWith: [] },
  ...Array.from({ length: 52 }, (_, i): Lead => ({ id: `l-p${i}`, userId: `p${i}`, listingId: 'casa', organizationId: 'org', status: 'QUALIFIED', source: 'CHAT', createdAt: at(1), lastActivityAt: new Date(at(1).getTime() + i * 60_000), brokerId: 'm-carla', conversationWith: [] })),
  // Outra imobiliária: nunca aparece.
  { id: 'l-foreign', userId: 'ana', listingId: 'func', organizationId: 'org2', status: 'NEW', source: 'CHAT', createdAt: at(1), lastActivityAt: at(25), brokerId: null, conversationWith: [] },
];

function matchStatus(status: string, cond: any): boolean {
  if (typeof cond === 'string') return status === cond;
  if (cond.in) return cond.in.includes(status);
  if (cond.notIn) return !cond.notIn.includes(status);
  throw new Error(`status não suportado: ${JSON.stringify(cond)}`);
}
function matches(lead: Lead, where: any): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, value]: [string, any]) => {
    switch (key) {
      case 'AND': return value.every((w: any) => matches(lead, w));
      case 'OR': return value.some((w: any) => matches(lead, w));
      case 'organizationId': return lead.organizationId === value;
      case 'status': return matchStatus(lead.status, value);
      case 'userId': return typeof value === 'string' ? lead.userId === value : value.in.includes(lead.userId);
      case 'id': return value.in.includes(lead.id);
      case 'assignments':
        if (value.some) return lead.brokerId !== null && (!value.some.brokerId || value.some.brokerId === lead.brokerId);
        if (value.none) return lead.brokerId === null;
        throw new Error('assignments não suportado');
      default: throw new Error(`filtro não suportado no teste: ${key}`);
    }
  });
}
function shape(lead: Lead, viewer: string) {
  const broker = members.find((m) => m.id === lead.brokerId);
  return {
    ...lead,
    closedAt: null, lostReason: null, lostNote: null, queuedAt: null, queueReason: null,
    user: users.find((u) => u.id === lead.userId),
    listing: { ...listings[lead.listingId], operationType: 'SALE', building: null },
    assignments: broker ? [{ assignedAt: lead.createdAt, firstContactAt: null, source: 'MANUAL', broker: { id: broker.id, user: broker.user } }] : [],
    tasks: [], visits: [],
    conversations: lead.conversationWith.includes(viewer) ? [{ id: `chat-${lead.id}` }] : [],
  };
}
let viewer = 'gestor';
const prisma = {
  organizationMember: { findUnique: async ({ where }: any) => members.find((m) => m.userId === where.userId) ?? null },
  user: { findMany: async ({ where }: any) => users.filter((u) => where.id.in.includes(u.id)) },
  lead: {
    count: async ({ where }: any) => leads.filter((l) => matches(l, where)).length,
    findMany: async ({ where }: any) => leads.filter((l) => matches(l, where))
      .sort((a, b) => b.lastActivityAt.getTime() - a.lastActivityAt.getTime() || a.id.localeCompare(b.id))
      .map((l) => shape(l, viewer)),
    groupBy: async ({ by, where }: any) => {
      assert.deepEqual(by, ['userId']);
      const groups = new Map<string, Lead[]>();
      for (const l of leads.filter((x) => matches(x, where))) groups.set(l.userId, [...(groups.get(l.userId) ?? []), l]);
      return [...groups].map(([userId, rows]) => ({
        userId,
        _max: { lastActivityAt: new Date(Math.max(...rows.map((r) => r.lastActivityAt.getTime()))) },
        _min: { createdAt: new Date(Math.min(...rows.map((r) => r.createdAt.getTime()))) },
        _count: { _all: rows.length },
      }));
    },
  },
};
(globalThis as unknown as { prisma: unknown }).prisma = prisma;
const { getWorkspaceContacts } = await import('./workspace.controller.js');

const app = Fastify();
app.get('/organizations/contacts', { preHandler: async (req) => { viewer = String(req.headers['x-user']); req.user = { id: viewer } as typeof req.user; } }, getWorkspaceContacts);

async function get(user: string, query: string) {
  const res = await app.inject({ method: 'GET', url: `/organizations/contacts?${query}`, headers: { 'x-user': user } });
  assert.equal(res.statusCode, 200, res.body);
  return { body: res.json(), raw: res.body };
}
const person = (body: any, id: string) => body.items.filter((p: any) => p.id === id);

test('gestor vê Ana uma vez, com os dois imóveis e responsáveis distintos', async () => {
  const { body } = await get('gestor', 'view=people');
  const [ana, ...dupes] = person(body, 'ana');
  assert.equal(dupes.length, 0);
  assert.equal(ana.primaryListing.name, 'Apartamento Savassi', 'imóvel com atividade mais recente');
  assert.equal(ana.otherOpportunities, 1);
  assert.equal(ana.openOpportunities, 2);
  assert.deepEqual(ana.opportunities.map((o: any) => [o.listing.name, o.broker.name]).sort(), [['Apartamento Funcionários', 'Bruno'], ['Apartamento Savassi', 'Carla']]);
  assert.equal(body.baseTotal, leads.filter((l) => l.organizationId === 'org').length);
  assert.ok(!body.items.some((p: any) => p.opportunities.some((o: any) => o.id === 'l-foreign')));
});

test('Bruno vê Ana uma vez, só Funcionários, sem "+1" nem rastro da carteira de Carla', async () => {
  const { body, raw } = await get('bruno', 'view=people');
  const [ana, ...dupes] = person(body, 'ana');
  assert.equal(dupes.length, 0);
  assert.equal(ana.primaryListing.name, 'Apartamento Funcionários');
  assert.equal(ana.otherOpportunities, 0);
  assert.equal(ana.visibleOpportunities, 1);
  assert.equal(ana.openOpportunities, 1);
  assert.deepEqual(Object.keys(ana.stages), ['CONTACTED']);
  assert.equal(ana.opportunities[0].conversationId, 'chat-l-ana-func', 'conversa autorizada do próprio atendimento');
  assert.ok(!raw.includes('Savassi'), 'nada da negociação de Carla vaza na resposta');
  assert.equal(body.baseTotal, 3, 'base autorizada de Bruno = só as suas oportunidades');
  assert.equal(body.opportunityTotal, 3);
  assert.equal(body.peopleTotal, 2);
});

test('pessoa com oportunidade aberta e encerrada aparece uma vez em cada visão', async () => {
  const open = (await get('bruno', 'view=people&stage=ACTIVE')).body;
  const closed = (await get('bruno', 'view=people&stage=CLOSED')).body;
  assert.equal(person(open, 'eva').length, 1);
  assert.equal(person(closed, 'eva').length, 1);
  assert.equal(person(closed, 'ana').length, 0);
  assert.deepEqual(closed.items.map((p: any) => p.id), ['eva']);
  assert.equal(closed.peopleTotal, 1);
  // Encerradas da gestão: ganho e perdido.
  const all = (await get('gestor', 'view=people&stage=CLOSED')).body;
  assert.deepEqual(all.items.map((p: any) => p.id).sort(), ['diego', 'eva']);
});

test('contagem e paginação valem para o recorte inteiro, não para a página carregada', async () => {
  const first = (await get('gestor', 'view=people&stage=ACTIVE')).body;
  assert.equal(first.peopleTotal, 55); // ana, eva, gil + 52
  assert.equal(first.items.length, 50);
  const second = (await get('gestor', 'view=people&stage=ACTIVE&page=2')).body;
  assert.equal(second.items.length, 5);
  const ids = new Set([...first.items, ...second.items].map((p: any) => p.id));
  assert.equal(ids.size, 55, 'nenhuma pessoa repetida entre páginas');
});

test('"Sem responsável" fica ligado às oportunidades abertas', async () => {
  const { body } = await get('gestor', 'view=opportunities&stage=ACTIVE&unassigned=true');
  assert.deepEqual(body.items.map((o: any) => o.id), ['l-gil-queue']);
  assert.equal(body.total, 1);
});
