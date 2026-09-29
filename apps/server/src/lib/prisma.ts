import { PrismaClient } from '@prisma/client';

// `minNegotiablePrice` é o piso sigiloso de negociação do anúncio — omitido de TODA consulta por
// padrão, porque várias rotas públicas devolvem a linha de Listing inteira. Quem precisa dele
// (lib/negotiations.ts, edição pelo anunciante) pede explicitamente com
// `omit: { minNegotiablePrice: false }`.
function createClient() {
  return new PrismaClient({ log: ['error'], omit: { listing: { minNegotiablePrice: true } } });
}

// Singleton para evitar múltiplas instâncias em dev (hot-reload)
const globalForPrisma = global as unknown as { prisma: ReturnType<typeof createClient> };

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
