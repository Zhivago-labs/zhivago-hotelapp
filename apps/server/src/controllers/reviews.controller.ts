import type { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { isStayFinished } from '../lib/bookings.js';

type Eligibility = { canReview: boolean; bookingId: string | null; reason: string | null };

/**
 * Avaliar só depois da estadia, uma vez por estadia: a reserva precisa estar confirmada, com o
 * dia do check-out já alcançado, e ainda sem avaliação. `bookingId` escolhe qual estadia (o
 * cartão da reserva manda); sem ele, usa a estadia finalizada mais antiga ainda não avaliada.
 */
async function getReviewEligibility(userId: string, listingId: string, bookingId?: string): Promise<Eligibility> {
  const bookings = await prisma.booking.findMany({
    where: { listingId, userId, status: 'CONFIRMED', ...(bookingId ? { id: bookingId } : {}) },
    include: { review: { select: { id: true } } },
    orderBy: { endDate: 'asc' },
  });

  const finished = bookings.filter((b) => isStayFinished(b));
  const pending = finished.find((b) => !b.review);
  if (pending) return { canReview: true, bookingId: pending.id, reason: null };

  if (finished.length > 0) return { canReview: false, bookingId: null, reason: 'Você já avaliou esta estadia.' };
  if (bookings.length > 0) {
    return { canReview: false, bookingId: null, reason: 'Você poderá avaliar a partir do dia do check-out.' };
  }
  return { canReview: false, bookingId: null, reason: 'Você só pode avaliar imóveis em que já se hospedou.' };
}

export async function createReview(request: FastifyRequest, reply: FastifyReply) {
  const { id: userId } = request.user as { id: string };
  const { id: listingId } = request.params as { id: string };

  const schema = z.object({
    rating: z.number().min(1).max(5),
    comment: z.string().optional(),
    bookingId: z.string().optional(),
  });

  const parsed = schema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({ error: parsed.error.errors });
  }

  const { rating, comment, bookingId } = parsed.data;

  // Verifica se o imóvel existe e se é de aluguel
  const listing = await prisma.listing.findUnique({ where: { id: listingId } });
  if (!listing) return reply.status(404).send({ error: 'Imóvel não encontrado.' });
  if (listing.category !== 'aluguel') return reply.status(400).send({ error: 'Avaliações só estão disponíveis para aluguel.' });

  const eligibility = await getReviewEligibility(userId, listingId, bookingId);
  if (!eligibility.canReview) {
    return reply.status(403).send({ error: eligibility.reason });
  }

  try {
    const review = await prisma.review.create({
      data: {
        rating,
        comment: comment ?? null,
        userId,
        listingId,
        bookingId: eligibility.bookingId,
      },
      include: {
        user: { select: { name: true, avatar: true } }
      }
    });

    return reply.status(201).send(review);
  } catch (error) {
    // Unique de bookingId: duas abas enviando a mesma avaliação ao mesmo tempo.
    if ((error as { code?: string }).code === 'P2002') {
      return reply.status(409).send({ error: 'Você já avaliou esta estadia.' });
    }
    return reply.status(500).send({ error: 'Erro ao salvar avaliação.' });
  }
}

export async function getMyReviewEligibility(request: FastifyRequest, reply: FastifyReply) {
  const { id: userId } = request.user as { id: string };
  const { id: listingId } = request.params as { id: string };

  try {
    return reply.send(await getReviewEligibility(userId, listingId));
  } catch (error) {
    return reply.status(500).send({ error: 'Erro ao verificar avaliação.' });
  }
}

export async function getReviews(request: FastifyRequest, reply: FastifyReply) {
  const { id: listingId } = request.params as { id: string };

  try {
    const reviews = await prisma.review.findMany({
      where: { listingId },
      include: {
        user: { select: { name: true, avatar: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    return reply.send(reviews);
  } catch (error) {
    return reply.status(500).send({ error: 'Erro ao buscar avaliações.' });
  }
}
