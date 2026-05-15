import type { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';

export async function createReview(request: FastifyRequest, reply: FastifyReply) {
  const { id: userId } = request.user as { id: string };
  const { id: listingId } = request.params as { id: string };

  const schema = z.object({
    rating: z.number().min(1).max(5),
    comment: z.string().optional(),
  });

  const parsed = schema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({ error: parsed.error.errors });
  }

  const { rating, comment } = parsed.data;

  // Verifica se o imóvel existe e se é de aluguel
  const listing = await prisma.listing.findUnique({ where: { id: listingId } });
  if (!listing) return reply.status(404).send({ error: 'Imóvel não encontrado.' });
  if (listing.category !== 'aluguel') return reply.status(400).send({ error: 'Avaliações só estão disponíveis para aluguel.' });

  // Verifica se o usuário tem uma reserva para este imóvel
  const hasBooking = await prisma.booking.findFirst({
    where: {
      listingId,
      userId,
      status: 'CONFIRMED'
    }
  });

  if (!hasBooking) {
    return reply.status(403).send({ error: 'Você só pode avaliar imóveis que já alugou.' });
  }

  try {
    const review = await prisma.review.create({
      data: {
        rating,
        comment,
        userId,
        listingId,
      },
      include: {
        user: { select: { name: true, avatar: true } }
      }
    });

    return reply.status(201).send(review);
  } catch (error) {
    return reply.status(500).send({ error: 'Erro ao salvar avaliação.' });
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
