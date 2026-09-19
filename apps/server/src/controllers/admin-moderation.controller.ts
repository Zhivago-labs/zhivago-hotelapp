import type { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { sendNotification } from '../services/notification.service.js';
import { logAdminAction } from '../lib/admin-log.js';
import { effectiveBookingPrice } from '../lib/bookings.js';

function adminId(request: FastifyRequest): string {
  return (request.user as { id: string }).id;
}

// ─── RECEITA (GMV — volume transacionado pela plataforma) ────────────────────
// Não existe comissão/taxa de plataforma no sistema hoje — o "lucro" aqui é o volume
// transacionado (quanto passou pela plataforma), não lucro líquido de verdade.
// Aluguel: preço da listing × noites da reserva CONFIRMED (ou preço cheio se for ciclo "mês").
// Venda: valor da proposta ACCEPTED (já é o preço final negociado).

function bookingRevenue(price: number, billingCycle: string | null, startDate: Date, endDate: Date): number {
  if (billingCycle === 'mês') return price;
  const nights = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / 86_400_000));
  return price * nights;
}

export async function getRevenueStats(
  _request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const [confirmedBookings, acceptedOffers] = await Promise.all([
    prisma.booking.findMany({
      where: { status: 'CONFIRMED', createdAt: { gte: sixMonthsAgo } },
      select: {
        createdAt: true,
        startDate: true,
        endDate: true,
        price: true,
        discountedPrice: true,
        listing: { select: { price: true, billingCycle: true } },
      },
    }),
    prisma.offer.findMany({
      where: { status: 'ACCEPTED', createdAt: { gte: sixMonthsAgo } },
      select: { createdAt: true, value: true },
    }),
  ]);

  const monthly: Record<string, { rental: number; sales: number }> = {};
  let totalRentalRevenue = 0;
  let totalSalesRevenue = 0;

  for (const booking of confirmedBookings) {
    const price = effectiveBookingPrice(booking, booking.listing.price);
    const value = bookingRevenue(price, booking.listing.billingCycle, booking.startDate, booking.endDate);
    totalRentalRevenue += value;
    const month = booking.createdAt.toISOString().slice(0, 7);
    monthly[month] ??= { rental: 0, sales: 0 };
    monthly[month]!.rental += value;
  }

  for (const offer of acceptedOffers) {
    totalSalesRevenue += offer.value;
    const month = offer.createdAt.toISOString().slice(0, 7);
    monthly[month] ??= { rental: 0, sales: 0 };
    monthly[month]!.sales += offer.value;
  }

  return reply.send({
    totalRentalRevenue,
    totalSalesRevenue,
    totalRevenue: totalRentalRevenue + totalSalesRevenue,
    monthly,
  });
}

// ─── RESERVAS (visão do admin) ────────────────────────────────────────────────

export async function getAllBookings(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const query = request.query as { status?: string; listingId?: string; page?: string };
  const page = Math.max(1, Number(query.page ?? '1'));
  const take = 20;
  const skip = (page - 1) * take;

  const where: Record<string, string> = {};
  if (query.status) where['status'] = query.status;
  if (query.listingId) where['listingId'] = query.listingId;

  const [bookings, total] = await Promise.all([
    prisma.booking.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        listing: { select: { id: true, name: true } },
        user: { select: { id: true, name: true, email: true } },
      },
      take,
      skip,
    }),
    prisma.booking.count({ where }),
  ]);

  return reply.send({ bookings, total, page, totalPages: Math.ceil(total / take) });
}

export async function forceCancelBooking(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { id } = request.params as { id: string };
  const schema = z.object({ reason: z.string().min(5) });

  const parsed = schema.safeParse(request.body);
  if (!parsed.success) return reply.status(400).send({ error: parsed.error.errors });

  const booking = await prisma.booking.findUnique({ where: { id } });
  if (!booking) return reply.status(404).send({ error: 'Reserva não encontrada.' });

  if (booking.status === 'CANCELLED' || booking.status === 'REJECTED') {
    return reply.status(409).send({ error: 'Esta reserva já está cancelada/rejeitada.' });
  }

  const updated = await prisma.booking.update({
    where: { id },
    data: { status: 'CANCELLED' },
  });

  await sendNotification({
    userId: booking.userId,
    title: 'Reserva Cancelada',
    message: `Sua reserva foi cancelada pela administração. Motivo: ${parsed.data.reason}`,
    type: 'BOOKING',
  });

  await logAdminAction({
    adminId: adminId(request),
    action: 'BOOKING_FORCE_CANCEL',
    targetType: 'BOOKING',
    targetId: id,
    reason: parsed.data.reason,
  });

  return reply.send(updated);
}

// ─── PROPOSTAS (visão do admin — apenas leitura) ─────────────────────────────

export async function getAllOffers(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const query = request.query as { status?: string; listingId?: string; page?: string };
  const page = Math.max(1, Number(query.page ?? '1'));
  const take = 20;
  const skip = (page - 1) * take;

  const where: Record<string, string> = {};
  if (query.status) where['status'] = query.status;
  if (query.listingId) where['listingId'] = query.listingId;

  const [offers, total] = await Promise.all([
    prisma.offer.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        listing: { select: { id: true, name: true } },
        buyer: { select: { id: true, name: true, email: true } },
      },
      take,
      skip,
    }),
    prisma.offer.count({ where }),
  ]);

  return reply.send({ offers, total, page, totalPages: Math.ceil(total / take) });
}

// ─── AVALIAÇÕES (moderação do admin) ─────────────────────────────────────────

export async function getAllReviews(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const query = request.query as { listingId?: string; page?: string };
  const page = Math.max(1, Number(query.page ?? '1'));
  const take = 20;
  const skip = (page - 1) * take;

  const where: Record<string, string> = {};
  if (query.listingId) where['listingId'] = query.listingId;

  const [reviews, total] = await Promise.all([
    prisma.review.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        listing: { select: { id: true, name: true } },
        user: { select: { id: true, name: true, email: true } },
      },
      take,
      skip,
    }),
    prisma.review.count({ where }),
  ]);

  return reply.send({ reviews, total, page, totalPages: Math.ceil(total / take) });
}

export async function adminDeleteReview(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { id } = request.params as { id: string };
  const schema = z.object({ reason: z.string().optional() });
  const parsed = schema.safeParse(request.body ?? {});
  if (!parsed.success) return reply.status(400).send({ error: parsed.error.errors });

  const review = await prisma.review.findUnique({ where: { id } });
  if (!review) return reply.status(404).send({ error: 'Avaliação não encontrada.' });

  await prisma.review.delete({ where: { id } });

  await logAdminAction({
    adminId: adminId(request),
    action: 'REVIEW_DELETE',
    targetType: 'REVIEW',
    targetId: id,
    ...(parsed.data.reason !== undefined ? { reason: parsed.data.reason } : {}),
  });

  return reply.status(204).send();
}

// ─── NOTIFICAÇÃO EM MASSA ─────────────────────────────────────────────────────

const MAX_BROADCAST_RECIPIENTS = 2000;

export async function broadcastNotification(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const schema = z.object({
    title: z.string().min(1),
    message: z.string().min(1),
    targetStatus: z.enum(['ACTIVE', 'ALL']).default('ACTIVE'),
  });

  const parsed = schema.safeParse(request.body);
  if (!parsed.success) return reply.status(400).send({ error: parsed.error.errors });

  const { title, message, targetStatus } = parsed.data;

  const users = await prisma.user.findMany({
    where: targetStatus === 'ALL' ? {} : { status: 'ACTIVE' },
    select: { id: true },
  });

  if (users.length > MAX_BROADCAST_RECIPIENTS) {
    return reply.status(400).send({
      error: `Muitos destinatários (${users.length}). Reduza o público-alvo — limite de ${MAX_BROADCAST_RECIPIENTS} por envio.`,
    });
  }

  await Promise.all(
    users.map((u) =>
      sendNotification({ userId: u.id, title, message, type: 'SYSTEM' }).catch((e) =>
        console.error(`Falha ao notificar usuário ${u.id} no broadcast:`, e)
      )
    )
  );

  await logAdminAction({
    adminId: adminId(request),
    action: 'MASS_NOTIFICATION',
    targetType: 'BROADCAST',
    metadata: { recipientCount: users.length, targetStatus },
  });

  return reply.send({ success: true, recipientCount: users.length });
}

// ─── LOG DE AUDITORIA ─────────────────────────────────────────────────────────

export async function getAdminActionLogs(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const query = request.query as { action?: string; targetType?: string; page?: string };
  const page = Math.max(1, Number(query.page ?? '1'));
  const take = 20;
  const skip = (page - 1) * take;

  const where: Record<string, string> = {};
  if (query.action) where['action'] = query.action;
  if (query.targetType) where['targetType'] = query.targetType;

  const [logs, total] = await Promise.all([
    prisma.adminActionLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { admin: { select: { id: true, name: true, email: true } } },
      take,
      skip,
    }),
    prisma.adminActionLog.count({ where }),
  ]);

  return reply.send({ logs, total, page, totalPages: Math.ceil(total / take) });
}
