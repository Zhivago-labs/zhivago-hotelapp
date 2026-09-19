import type { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { z } from 'zod';
import { effectiveBookingPrice } from '../lib/bookings.js';

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
        accountType: true,
        companyName: true,
        creci: true,
        verified: true,
      },
    });

    if (!user) {
      return reply.status(404).send({ error: 'Usuário não encontrado.' });
    }

    // Vitrine pública (B2B): quando o usuário do perfil pertence a uma organização, o portfólio
    // exibido é o da organização inteira (`organizationId`), não só o que esse membro criou —
    // evita mostrar 0 imóveis pra quem criou uma empresa (imóvel de empresa tem ownerId null).
    const membership = await prisma.organizationMember.findUnique({
      where: { userId: id },
      include: { organization: { select: { id: true, name: true, logo: true, verified: true } } },
    });
    const listingsWhere = membership ? { organizationId: membership.organizationId } : { ownerId: id };

    const listings = await prisma.listing.findMany({
      where: {
        ...listingsWhere,
        status: { in: ['APPROVED', 'SOLD'] },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            avatar: true,
            accountType: true,
            companyName: true,
            creci: true,
            verified: true,
          },
        },
        organization: { select: { id: true, name: true, logo: true, verified: true } },
        agent: { select: { id: true, name: true, avatar: true } },
        images: { orderBy: { order: 'asc' } },
      },
    });

    const reviews = await prisma.review.findMany({
      where: { listing: listingsWhere },
      include: {
        user: { select: { name: true, avatar: true } },
        listing: { select: { name: true, id: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 15,
    });

    return reply.send({ user, organization: membership?.organization ?? null, listings, reviews });
  } catch (error) {
    console.error('Erro ao buscar perfil:', error);
    return reply.status(500).send({ error: 'Erro ao buscar perfil de usuário.' });
  }
}

function getMonthsInRange(startDate: Date, endDate: Date): string[] {
  const months: string[] = [];
  const curr = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
  const last = new Date(endDate.getFullYear(), endDate.getMonth(), 1);

  while (curr <= last) {
    const year = curr.getFullYear();
    const month = String(curr.getMonth() + 1).padStart(2, '0');
    months.push(`${year}-${month}`);
    curr.setMonth(curr.getMonth() + 1);
  }
  return months;
}

export async function getMyStats(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { id: userId } = request.user as { id: string };

  const now = new Date();
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const sixMonthsAgoYear = sixMonthsAgo.getFullYear();
  const sixMonthsAgoMonth = String(sixMonthsAgo.getMonth() + 1).padStart(2, '0');
  const sixMonthsAgoStr = `${sixMonthsAgoYear}-${sixMonthsAgoMonth}`;
  const currentYearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

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
        status: { notIn: ['CANCELLED', 'REJECTED'] },
        OR: [
          { createdAt: { gte: sixMonthsAgo } },
          { endDate: { gte: sixMonthsAgo } }
        ]
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

  // Preenche por padrão os últimos 6 meses com valor 0
  const tempDate = new Date(sixMonthsAgo);
  while (true) {
    const y = tempDate.getFullYear();
    const m = String(tempDate.getMonth() + 1).padStart(2, '0');
    const ymKey = `${y}-${m}`;
    revenueByMonth[ymKey] = 0;
    bookingsByMonth[ymKey] = 0;
    if (ymKey === currentYearMonth) break;
    tempDate.setMonth(tempDate.getMonth() + 1);
  }

  recentBookings.forEach(b => {
    const months = (b.startDate && b.endDate && new Date(b.startDate) <= new Date(b.endDate))
      ? getMonthsInRange(new Date(b.startDate), new Date(b.endDate))
      : [new Date(b.createdAt).toISOString().slice(0, 7)];

    const price = effectiveBookingPrice(b, b.listing.price);
    months.forEach(m => {
      if (m >= sixMonthsAgoStr && m <= currentYearMonth) {
        revenueByMonth[m] = (revenueByMonth[m] || 0) + price;
        bookingsByMonth[m] = (bookingsByMonth[m] || 0) + 1;
        rentalRevenue += price;
      }
    });
  });

  recentOffers.forEach(o => {
    const month = new Date(o.createdAt).toISOString().slice(0, 7);
    if (month >= sixMonthsAgoStr && month <= currentYearMonth) {
      revenueByMonth[month] = (revenueByMonth[month] || 0) + o.value;
      bookingsByMonth[month] = (bookingsByMonth[month] || 0) + 1;
      salesRevenue += o.value;
    }
  });

  const ratingsByProperty: Record<string, { total: number, count: number, name: string }> = {};
  reviews.forEach(r => {
    if (!ratingsByProperty[r.listingId]) {
      const listingName = listings.find(l => l.id === r.listingId)?.name || 'Desconhecido';
      ratingsByProperty[r.listingId] = { total: 0, count: 0, name: listingName };
    }
    const propRating = ratingsByProperty[r.listingId];
    if (propRating) {
      propRating.total += r.rating;
      propRating.count += 1;
    }
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
            location: true,
            price: true,
            images: { take: 1, orderBy: { order: 'asc' }, select: { url: true } },
          }
        }
      },
      orderBy: { startDate: 'desc' }
    });

    const withCoverImage = bookings.map((booking) => ({
      ...booking,
      price: effectiveBookingPrice(booking, booking.listing.price),
      listing: {
        id: booking.listing.id,
        name: booking.listing.name,
        location: booking.listing.location,
        price: booking.listing.price,
        image: booking.listing.images[0]?.url ?? null,
      },
    }));

    return reply.send(withCoverImage);
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
    platform: z.enum(['IOS', 'ANDROID', 'WEB']),
    // Token do Expo Push (IOS/ANDROID) ou a `PushSubscription` do navegador já serializada em
    // JSON (WEB) — um device por usuário por plataforma, o mais recente substitui o anterior.
    token: z.string().min(1),
  });

  try {
    const { platform, token } = schema.parse(request.body);

    await prisma.userDevice.upsert({
      where: { userId_platform: { userId, platform } },
      update: { token },
      create: { userId, platform, token },
    });

    return reply.send({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return reply.status(400).send({ error: error.errors });
    }
    console.error('Erro ao atualizar device de notificação:', error);
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
            select: {
              id: true,
              name: true,
              price: true,
              images: { take: 1, orderBy: { order: 'asc' }, select: { url: true } },
            },
          },
          user: {
            select: { name: true, avatar: true }
          }
        },
        orderBy: { startDate: 'desc' }
      })
    ]);

    const bookingsWithCoverImage = bookings.map((booking) => ({
      ...booking,
      // Preço travado da reserva (não o efetivo com desconto) — o dono precisa ver o valor base
      // pra gerenciar o desconto pontual a partir dele, não já com o desconto aplicado.
      price: booking.price ?? booking.listing.price,
      listing: {
        id: booking.listing.id,
        name: booking.listing.name,
        price: booking.listing.price,
        image: booking.listing.images[0]?.url ?? null,
      },
    }));

    return reply.send({
      bookings: bookingsWithCoverImage,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / limit)
    });
  } catch (error) {
    console.error('Erro ao buscar reservas recebidas:', error);
    return reply.status(500).send({ error: 'Erro ao buscar reservas recebidas.' });
  }
}
