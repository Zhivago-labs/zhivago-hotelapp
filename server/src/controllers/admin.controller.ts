import type { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { sendNotification } from '../services/notification.service.js';

// ─── ESTATÍSTICAS DO SISTEMA ──────────────────────────────────────────────────

export async function getStats(
  _request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const [
    totalUsers,
    totalListings,
    pendingListings,
    approvedListings,
    rejectedListings,
    recentBookings,
    casas,
    apartamentos,
    aluguel,
    venda
  ] = await Promise.all([
    prisma.user.count(),
    prisma.listing.count(),
    prisma.listing.count({ where: { status: 'PENDING' } }),
    prisma.listing.count({ where: { status: 'APPROVED' } }),
    prisma.listing.count({ where: { status: 'REJECTED' } }),
    prisma.booking.findMany({
      where: { createdAt: { gte: sixMonthsAgo } },
      select: { createdAt: true }
    }),
    prisma.listing.count({ where: { type: 'casa' } }),
    prisma.listing.count({ where: { type: 'apartamento' } }),
    prisma.listing.count({ where: { category: 'aluguel' } }),
    prisma.listing.count({ where: { category: 'venda' } }),
  ]);

  const bookingsByMonth = recentBookings.reduce((acc: Record<string, number>, booking) => {
    const month = booking.createdAt.toISOString().slice(0, 7);
    acc[month] = (acc[month] || 0) + 1;
    return acc;
  }, {});

  return reply.send({
    totalUsers,
    totalListings,
    listingsStatus: {
      pending: pendingListings,
      approved: approvedListings,
      rejected: rejectedListings,
    },
    listingsDistribution: {
      types: { casa: casas, apartamento: apartamentos },
      categories: { aluguel, venda },
    },
    bookingsByMonth
  });
}

// ─── LISTAR TODOS OS USUÁRIOS ─────────────────────────────────────────────────

export async function getAllUsers(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const query = request.query as { status?: string; role?: string; page?: string };
  const page = Math.max(1, Number(query.page ?? '1'));
  const take = 20;
  const skip = (page - 1) * take;

  const where: Record<string, string> = {};
  if (query.status) where['status'] = query.status;
  if (query.role) where['role'] = query.role;

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: { id: true, name: true, email: true, phone: true, role: true, status: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take,
      skip,
    }),
    prisma.user.count({ where }),
  ]);

  return reply.send({ users, total, page, totalPages: Math.ceil(total / take) });
}

// ─── ATUALIZAR STATUS DO USUÁRIO ──────────────────────────────────────────────

export async function updateUserStatus(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { id } = request.params as { id: string };
  const schema = z.object({
    status: z.enum(['ACTIVE', 'SUSPENDED', 'BANNED']),
  });

  const parsed = schema.safeParse(request.body);
  if (!parsed.success) return reply.status(400).send({ error: parsed.error.errors });

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return reply.status(404).send({ error: 'Usuário não encontrado.' });

  const updated = await prisma.user.update({
    where: { id },
    data: { status: parsed.data.status },
    select: { id: true, name: true, email: true, role: true, status: true },
  });

  return reply.send(updated);
}

// ─── ATUALIZAR ROLE DO USUÁRIO ────────────────────────────────────────────────

export async function updateUserRole(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { id } = request.params as { id: string };
  const schema = z.object({
    role: z.enum(['USER', 'ADMIN']),
  });

  const parsed = schema.safeParse(request.body);
  if (!parsed.success) return reply.status(400).send({ error: parsed.error.errors });

  const updated = await prisma.user.update({
    where: { id },
    data: { role: parsed.data.role },
    select: { id: true, name: true, email: true, role: true },
  });

  return reply.send(updated);
}

// ─── LISTAR TODOS OS IMÓVEIS (com filtro de status) ──────────────────────────

export async function adminGetListings(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const query = request.query as { status?: string; page?: string };
  const page = Math.max(1, Number(query.page ?? '1'));
  const take = 20;
  const skip = (page - 1) * take;

  const where = query.status ? { status: query.status } : {};

  const [listings, total] = await Promise.all([
    prisma.listing.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { owner: { select: { id: true, name: true, email: true } } },
      take,
      skip,
    }),
    prisma.listing.count({ where }),
  ]);

  return reply.send({ listings, total, page, totalPages: Math.ceil(total / take) });
}

// ─── APROVAR IMÓVEL ───────────────────────────────────────────────────────────

export async function approveListing(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { id } = request.params as { id: string };

  const listing = await prisma.listing.findUnique({ where: { id } });
  if (!listing) return reply.status(404).send({ error: 'Imóvel não encontrado.' });

  const updated = await prisma.listing.update({
    where: { id },
    data: { status: 'APPROVED', rejectReason: null },
  });

  if (updated.ownerId) {
    await sendNotification({
      userId: updated.ownerId,
      title: 'Anúncio Aprovado! 🎉',
      message: `Seu imóvel "${updated.name}" foi aprovado e já está público no aplicativo.`,
      type: 'SYSTEM',
    });
  }

  return reply.send(updated);
}

// ─── VOLTAR PARA PENDENTE ─────────────────────────────────────────────────────

export async function pendingListing(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { id } = request.params as { id: string };

  const listing = await prisma.listing.findUnique({ where: { id } });
  if (!listing) return reply.status(404).send({ error: 'Imóvel não encontrado.' });

  const updated = await prisma.listing.update({
    where: { id },
    data: { status: 'PENDING', rejectReason: null },
  });

  if (updated.ownerId) {
    await sendNotification({
      userId: updated.ownerId,
      title: 'Anúncio em Análise ⏳',
      message: `Seu imóvel "${updated.name}" foi colocado em análise pela moderação e ficará temporariamente oculto nas buscas.`,
      type: 'SYSTEM',
    });
  }

  return reply.send(updated);
}

// ─── REJEITAR IMÓVEL ──────────────────────────────────────────────────────────

export async function rejectListing(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { id } = request.params as { id: string };
  const schema = z.object({ reason: z.string().min(5) });

  const parsed = schema.safeParse(request.body);
  if (!parsed.success) return reply.status(400).send({ error: parsed.error.errors });

  const listing = await prisma.listing.findUnique({ where: { id } });
  if (!listing) return reply.status(404).send({ error: 'Imóvel não encontrado.' });

  const updated = await prisma.listing.update({
    where: { id },
    data: { status: 'REJECTED', rejectReason: parsed.data.reason },
  });

  if (updated.ownerId) {
    await sendNotification({
      userId: updated.ownerId,
      title: 'Anúncio Rejeitado ❌',
      message: `Seu imóvel "${updated.name}" foi rejeitado pela moderação. Motivo: ${parsed.data.reason}`,
      type: 'SYSTEM',
    });
  }

  return reply.send(updated);
}

// ─── REMOVER IMÓVEL (admin) ───────────────────────────────────────────────────

export async function adminDeleteListing(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { id } = request.params as { id: string };

  const listing = await prisma.listing.findUnique({ where: { id } });
  if (!listing) return reply.status(404).send({ error: 'Imóvel não encontrado.' });

  await prisma.listing.delete({ where: { id } });
  return reply.status(204).send();
}
