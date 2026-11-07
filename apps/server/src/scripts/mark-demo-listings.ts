import { prisma } from '../lib/prisma.js';

// Explicit IDs only. No title or price heuristics. Default mode is read-only.
const apply = process.argv.includes('--apply');
const ids = process.argv.slice(2).filter(value => value !== '--apply');
if (!ids.length || ids.some(id => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))) {
  throw new Error('Informe os UUIDs revisados. Sem --apply, apenas mostra os registros.');
}
try {
  const listings = await prisma.listing.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, price: true, status: true, isDemo: true } });
  console.table(listings);
  if (listings.length !== new Set(ids).size) throw new Error('Um ou mais IDs não foram encontrados. Nenhuma alteração foi aplicada.');
  if (apply) {
    const result = await prisma.listing.updateMany({ where: { id: { in: ids } }, data: { isDemo: true } });
    console.log(`${result.count} registro(s) marcado(s) como demonstração; dados e status preservados.`);
  } else console.log('Somente consulta. Revise os IDs e repita com --apply para marcar.');
} finally { await prisma.$disconnect(); }
