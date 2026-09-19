// Corrige leads antigos que ficaram sem atribuição por causa do bug corrigido em distributeLead
// (lib/leads.ts): imóvel cadastrado por um corretor, mas o lead nunca foi automaticamente
// atribuído a ele. Roda uma vez, é seguro rodar de novo (idempotente — só age em leads que ainda
// não têm atribuição aberta).
import { prisma } from '../lib/prisma.js';
import { assignLead } from '../lib/leads.js';

async function main() {
  const unassignedLeads = await prisma.lead.findMany({
    where: { assignments: { none: { unassignedAt: null } } },
    include: { listing: { select: { agentId: true } } },
  });

  let fixed = 0;
  for (const lead of unassignedLeads) {
    if (!lead.listing.agentId) continue;

    const agentMembership = await prisma.organizationMember.findUnique({ where: { userId: lead.listing.agentId } });
    if (!agentMembership || agentMembership.organizationId !== lead.organizationId || agentMembership.role !== 'BROKER') {
      continue;
    }

    await assignLead({ leadId: lead.id, brokerMemberId: agentMembership.id, assignedByMemberId: null });
    fixed += 1;
    console.log(`Lead ${lead.id} atribuído ao corretor ${agentMembership.id} (dono do imóvel ${lead.listingId}).`);
  }

  console.log(`Concluído: ${fixed} lead(s) corrigido(s) de ${unassignedLeads.length} sem atribuição.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
