import type { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { z } from 'zod';

export async function getUserProfile(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { id } = request.params as { id: string };

  try {
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        avatar: true,
        phone: true,
        createdAt: true,
      },
    });

    if (!user) {
      return reply.status(404).send({ error: 'Usuário não encontrado.' });
    }

    const listings = await prisma.listing.findMany({
      where: {
        ownerId: id,
        status: 'APPROVED',
      },
      orderBy: { createdAt: 'desc' },
    });

    const reviews = await prisma.review.findMany({
      where: {
        listing: {
          ownerId: id,
        },
      },
      include: {
        user: { select: { name: true, avatar: true } },
        listing: { select: { name: true, id: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 15,
    });

    return reply.send({ user, listings, reviews });
  } catch (error) {
    console.error('Erro ao buscar perfil:', error);
    return reply.status(500).send({ error: 'Erro ao buscar perfil de usuário.' });
  }
}

export async function getMyStats(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { id: userId } = request.user as { id: string };

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const listings = await prisma.listing.findMany({
    where: { ownerId: userId },
    select: { id: true, name: true, status: true, price: true }
  });

  const listingIds = listings.map(l => l.id);

  if (listingIds.length === 0) {
    return reply.send({
      statusCounts: { pending: 0, approved: 0, rejected: 0 },
      bookingsByMonth: {},
      revenueByMonth: {},
      propertyRatings: [],
      rentalRevenue: 0,
      salesRevenue: 0
    });
  }

  const [recentBookings, reviews, recentOffers] = await Promise.all([
    prisma.booking.findMany({
      where: {
        listingId: { in: listingIds },
        createdAt: { gte: sixMonthsAgo }
      },
      include: { listing: { select: { price: true } } }
    }),
    prisma.review.findMany({
      where: { listingId: { in: listingIds } }
    }),
    prisma.offer.findMany({
      where: {
        listingId: { in: listingIds },
        createdAt: { gte: sixMonthsAgo },
        status: 'ACCEPTED'
      }
    })
  ]);

  const statusCounts = { pending: 0, approved: 0, rejected: 0 };
  listings.forEach(l => {
    if (l.status === 'PENDING') statusCounts.pending++;
    if (l.status === 'APPROVED' || l.status === 'SOLD') statusCounts.approved++;
    if (l.status === 'REJECTED') statusCounts.rejected++;
  });

  const revenueByMonth: Record<string, number> = {};
  const bookingsByMonth: Record<string, number> = {};
  let rentalRevenue = 0;
  let salesRevenue = 0;

  recentBookings.forEach(b => {
    const month = b.createdAt.toISOString().slice(0, 7);
    revenueByMonth[month] = (revenueByMonth[month] || 0) + b.listing.price;
    bookingsByMonth[month] = (bookingsByMonth[month] || 0) + 1;
    rentalRevenue += b.listing.price;
  });

  recentOffers.forEach(o => {
    const month = o.createdAt.toISOString().slice(0, 7);
    revenueByMonth[month] = (revenueByMonth[month] || 0) + o.value;
    bookingsByMonth[month] = (bookingsByMonth[month] || 0) + 1;
    salesRevenue += o.value;
  });

  const ratingsByProperty: Record<string, { total: number, count: number, name: string }> = {};
  reviews.forEach(r => {
    if (!ratingsByProperty[r.listingId]) {
      const listingName = listings.find(l => l.id === r.listingId)?.name || 'Desconhecido';
      ratingsByProperty[r.listingId] = { total: 0, count: 0, name: listingName };
    }
    ratingsByProperty[r.listingId].total += r.rating;
    ratingsByProperty[r.listingId].count += 1;
  });

  const propertyRatings = Object.values(ratingsByProperty).map(p => ({
    name: p.name,
    average: p.total / p.count
  }));

  return reply.send({
    statusCounts,
    bookingsByMonth,
    revenueByMonth,
    propertyRatings,
    rentalRevenue,
    salesRevenue
  });
}

export async function getMyBookings(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { id: userId } = request.user as { id: string };

  try {
    const bookings = await prisma.booking.findMany({
      where: { userId },
      include: {
        listing: {
          select: {
            id: true,
            name: true,
            image: true,
            location: true,
            price: true,
          }
        }
      },
      orderBy: { startDate: 'desc' }
    });
    
    return reply.send(bookings);
  } catch (error) {
    console.error('Erro ao buscar viagens:', error);
    return reply.status(500).send({ error: 'Erro ao buscar histórico de viagens.' });
  }
}

export async function updatePushToken(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { id: userId } = request.user as { id: string };

  const schema = z.object({
    pushToken: z.string()
  });

  try {
    const { pushToken } = schema.parse(request.body);

    await prisma.user.update({
      where: { id: userId },
      data: { pushToken }
    });

    return reply.send({ success: true });
  } catch (error) {
    console.error('Erro ao atualizar pushToken:', error);
    return reply.status(500).send({ error: 'Erro ao atualizar token de notificação.' });
  }
}

export async function getReceivedBookings(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { id: userId } = request.user as { id: string };
  const { page = '1', search = '' } = request.query as { page?: string, search?: string };
  const limit = 5;
  const skip = (parseInt(page) - 1) * limit;

  try {
    const listings = await prisma.listing.findMany({
      where: { ownerId: userId },
      select: { id: true }
    });
    const listingIds = listings.map(l => l.id);

    const whereClause: any = {
      listingId: { in: listingIds }
    };

    if (search.trim()) {
      whereClause.OR = [
        { user: { name: { contains: search } } },
        { listing: { name: { contains: search } } }
      ];
    }

    const [total, bookings] = await Promise.all([
      prisma.booking.count({ where: whereClause }),
      prisma.booking.findMany({
        where: whereClause,
        skip,
        take: limit,
        include: {
          listing: {
            select: { id: true, name: true, image: true, price: true }
          },
          user: {
            select: { name: true, avatar: true, email: true, phone: true }
          }
        },
        orderBy: { startDate: 'desc' }
      })
    ]);
    
    return reply.send({
      bookings,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / limit)
    });
  } catch (error) {
    console.error('Erro ao buscar reservas recebidas:', error);
    return reply.status(500).send({ error: 'Erro ao buscar reservas recebidas.' });
  }
}
