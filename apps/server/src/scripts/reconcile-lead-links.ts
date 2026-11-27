// Reconciliação de vínculos legados com o CRM (docs/mapeamento-crm-zhivago.md, entrega 3).
//
// Conversas, reservas, ofertas e negociações de imóveis de imobiliária ainda sem `leadId` são
// vinculadas à oportunidade do mesmo cliente + imóvel — SÓ quando cliente, imóvel e imobiliária
// são identificáveis sem ambiguidade. Nada é apagado; mensagens, etapas e atribuições ficam como
// estão. Casos ambíguos são listados para revisão manual.
//
//   npx tsx src/scripts/reconcile-lead-links.ts                 → simulação (padrão): contagens + amostras
//   npx tsx src/scripts/reconcile-lead-links.ts --apply         → aplica os vínculos a leads existentes
//   npx tsx src/scripts/reconcile-lead-links.ts --apply --create-missing
//        → também cria a oportunidade que falta (origem do registro, data original, fila "LEGACY",
//          sem distribuição automática — a gestão atribui pela fila "Sem responsável")
//
// Idempotente: só toca registros com `leadId` nulo; rodar de novo após aplicar não muda nada.
import { prisma } from '../lib/prisma.js';

const APPLY = process.argv.includes('--apply');
const CREATE_MISSING = process.argv.includes('--create-missing');
const SAMPLE = 5;

type Kind = 'conversation' | 'booking' | 'offer' | 'negotiation';
type Candidate = { kind: Kind; id: string; listingId: string; organizationId: string; customerIds: string[]; createdAt: Date; source: string };
type Report = { scanned: number; linked: number; created: number; missingLead: number; ambiguous: number; failed: number; samples: Record<string, string[]> };

const report: Record<Kind, Report> = {
  conversation: emptyReport(), booking: emptyReport(), offer: emptyReport(), negotiation: emptyReport(),
};
function emptyReport(): Report {
  return { scanned: 0, linked: 0, created: 0, missingLead: 0, ambiguous: 0, failed: 0, samples: {} };
}
function sample(kind: Kind, bucket: string, id: string) {
  const list = (report[kind].samples[bucket] ??= []);
  if (list.length < SAMPLE) list.push(id);
}

const memberCache = new Map<string, Set<string>>();
async function orgUserIds(organizationId: string): Promise<Set<string>> {
  if (!memberCache.has(organizationId)) {
    const members = await prisma.organizationMember.findMany({ where: { organizationId }, select: { userId: true } });
    memberCache.set(organizationId, new Set(members.map((m) => m.userId)));
  }
  return memberCache.get(organizationId)!;
}

async function candidates(): Promise<Candidate[]> {
  const orgListing = { organizationId: { not: null } };
  const [conversations, bookings, offers, negotiations] = await Promise.all([
    prisma.conversation.findMany({ where: { leadId: null, property: orgListing }, select: { id: true, propertyId: true, createdAt: true, property: { select: { organizationId: true } }, participants: { select: { id: true } } } }),
    prisma.booking.findMany({ where: { leadId: null, listing: orgListing }, select: { id: true, listingId: true, userId: true, createdAt: true, listing: { select: { organizationId: true } } } }),
    prisma.offer.findMany({ where: { leadId: null, listing: orgListing }, select: { id: true, listingId: true, buyerId: true, createdAt: true, listing: { select: { organizationId: true } } } }),
    prisma.negotiation.findMany({ where: { leadId: null, listing: orgListing }, select: { id: true, listingId: true, customerId: true, createdAt: true, listing: { select: { organizationId: true } } } }),
  ]);
  const out: Candidate[] = [];
  for (const c of conversations) {
    const members = await orgUserIds(c.property.organizationId!);
    out.push({ kind: 'conversation', id: c.id, listingId: c.propertyId, organizationId: c.property.organizationId!, customerIds: c.participants.map((p) => p.id).filter((id) => !members.has(id)), createdAt: c.createdAt, source: 'CHAT' });
  }
  for (const b of bookings) out.push({ kind: 'booking', id: b.id, listingId: b.listingId, organizationId: b.listing.organizationId!, customerIds: [b.userId], createdAt: b.createdAt, source: 'BOOKING' });
  for (const o of offers) out.push({ kind: 'offer', id: o.id, listingId: o.listingId, organizationId: o.listing.organizationId!, customerIds: [o.buyerId], createdAt: o.createdAt, source: 'OFFER' });
  for (const n of negotiations) out.push({ kind: 'negotiation', id: n.id, listingId: n.listingId, organizationId: n.listing.organizationId!, customerIds: [n.customerId], createdAt: n.createdAt, source: 'OFFER' });
  return out;
}

async function link(kind: Kind, id: string, leadId: string) {
  const where = { id, leadId: null };
  const data = { leadId };
  if (kind === 'conversation') return prisma.conversation.updateMany({ where, data });
  if (kind === 'booking') return prisma.booking.updateMany({ where, data });
  if (kind === 'offer') return prisma.offer.updateMany({ where, data });
  return prisma.negotiation.updateMany({ where, data });
}

async function main() {
  const list = await candidates();
  for (const c of list) {
    const r = report[c.kind];
    r.scanned += 1;
    if (c.customerIds.length !== 1) {
      r.ambiguous += 1;
      sample(c.kind, c.customerIds.length ? 'ambiguous_multiple_customers' : 'ambiguous_no_customer', c.id);
      continue;
    }
    const userId = c.customerIds[0]!;
    try {
      let lead = await prisma.lead.findUnique({ where: { userId_listingId: { userId, listingId: c.listingId } } });
      if (lead && lead.organizationId !== c.organizationId) {
        r.ambiguous += 1;
        sample(c.kind, 'ambiguous_other_organization', c.id);
        continue;
      }
      if (!lead) {
        if (!CREATE_MISSING) {
          r.missingLead += 1;
          sample(c.kind, 'missing_lead', c.id);
          continue;
        }
        if (APPLY) {
          lead = await prisma.lead.upsert({
            where: { userId_listingId: { userId, listingId: c.listingId } },
            update: {},
            create: {
              userId, listingId: c.listingId, organizationId: c.organizationId, source: c.source,
              createdAt: c.createdAt, lastActivityAt: c.createdAt, queuedAt: c.createdAt, queueReason: 'LEGACY',
              entries: { create: { source: c.source, kind: 'ENTRY', note: 'Reconciliado de registro legado', createdAt: c.createdAt } },
            },
          });
        }
        r.created += 1;
        sample(c.kind, 'created_lead', c.id);
        if (!APPLY) continue;
      }
      if (APPLY) await link(c.kind, c.id, lead!.id);
      r.linked += 1;
      sample(c.kind, 'linked', c.id);
    } catch (err) {
      r.failed += 1;
      sample(c.kind, 'failed', c.id);
      console.error(`Falha em ${c.kind} ${c.id}:`, err);
    }
  }

  console.log(`\nReconciliação de vínculos legados — ${APPLY ? 'APLICADO' : 'SIMULAÇÃO (nada foi gravado)'}${CREATE_MISSING ? ' · criando oportunidades faltantes' : ''}\n`);
  for (const [kind, r] of Object.entries(report)) {
    console.log(`${kind.padEnd(12)} lidos=${r.scanned} vincular=${r.linked} criar_lead=${r.created} sem_lead=${r.missingLead} ambíguos=${r.ambiguous} falhas=${r.failed}`);
    for (const [bucket, ids] of Object.entries(r.samples)) console.log(`  ${bucket}: ${ids.join(', ')}`);
  }
  if (!APPLY) console.log('\nRevise as amostras acima. Para gravar: --apply (e --create-missing para criar as oportunidades que faltam).');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
