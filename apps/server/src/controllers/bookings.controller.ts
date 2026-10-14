import type { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { sendNotification } from '../services/notification.service.js';
import { getIO } from '../socket.js';
import { ensureLead, getCurrentAssignment, canManageListingConversation, closeLeadForDealOutcome } from '../lib/leads.js';
import { canManageOrgListing } from './listings.controller.js';
import { closeNegotiationsForBooking } from '../lib/negotiations.js';

const senderSelect = { select: { id: true, name: true, avatar: true } } as const;

/** Emite pra sala de cada usuário (ver socket.ts); no-op se o socket não estiver inicializado. */
function emitToRooms(userIds: Iterable<string>, event: string, payload: unknown) {
  try {
    const io = getIO();
    for (const id of new Set(userIds)) io.to(`room_${id}`).emit(event, payload);
  } catch {}
}

/** Conversa do hóspede sobre o imóvel — busca só pelo hóspede, igual à criação da reserva. */
function findGuestConversation(listingId: string, guestId: string) {
  return prisma.conversation.findFirst({
    where: { propertyId: listingId, participants: { some: { id: guestId } } },
    include: { participants: { select: { id: true } } },
  });
}

/**
 * Fecha o card da solicitação (BOOKING_REQUEST → `resolvedType`), avisa as duas telas e posta a
 * mensagem de texto do desfecho. Usado por aprovar, recusar e cancelar.
 */
async function resolveBookingInChat(
  booking: { id: string; listingId: string; userId: string },
  actorId: string,
  resolvedType: 'BOOKING_APPROVED' | 'BOOKING_REJECTED' | 'BOOKING_CANCELLED',
  text: string
) {
  const conversation = await findGuestConversation(booking.listingId, booking.userId);
  if (!conversation) return;

  await prisma.message.updateMany({
    where: { conversationId: conversation.id, type: 'BOOKING_REQUEST', metadata: { contains: booking.id } },
    data: { type: resolvedType },
  });
  await emitBookingCardUpdates(conversation.id, booking.id, resolvedType);

  const message = await prisma.message.create({
    data: { content: text, type: 'TEXT', senderId: actorId, conversationId: conversation.id },
    include: { sender: senderSelect },
  });
  await prisma.conversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } });

  emitToRooms([...conversation.participants.map((p) => p.id), actorId], 'receiveMessage', message);
}

export async function createBooking(request: FastifyRequest, reply: FastifyReply) {
  const { id: userId, role } = request.user as { id: string; role: string };
  if (role === 'ADMIN') {
    return reply.status(403).send({ error: 'Administradores não podem fazer reservas.' });
  }
  const { id: listingId } = request.params as { id: string };

  const schema = z.object({
    startDate: z.string().datetime(),
    endDate: z.string().datetime(),
  });

  const parsed = schema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({ error: parsed.error.errors });
  }

  const { startDate, endDate } = parsed.data;

  // Verifica se o imóvel existe e se aceita reserva por diária. `category === 'aluguel'` sozinho
  // deixava aluguel MENSAL cair aqui também (bug crítico, seção 50/109/148/162 da spec) — agora
  // exige `operationType === 'DAILY_RENT'` explicitamente.
  const listing = await prisma.listing.findUnique({ where: { id: listingId } });
  if (!listing) return reply.status(404).send({ error: 'Imóvel não encontrado.' });
  if (listing.operationType !== 'DAILY_RENT') {
    return reply.status(400).send({ error: 'Reservas só estão disponíveis para aluguel por diária.' });
  }

  // Seção 53 da spec: [startDate, endDate) — checkout não conta como noite.
  const nights = Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86_400_000);
  if (nights < 1) {
    return reply.status(400).send({ error: 'O período da reserva precisa ter ao menos 1 noite.' });
  }

  try {
    // Lead nasce ANTES do Booking (seção 51/109 da spec) — se a criação/distribuição do Lead
    // falhar, a reserva nunca chega a existir "órfã" de Lead. Só para imóvel de organização (CRM).
    let leadId: string | null = null;
    if (listing.organizationId) {
      const lead = await ensureLead({
        userId,
        listingId,
        organizationId: listing.organizationId,
        source: 'BOOKING',
      });
      leadId = lead.id;
    }

    // Snapshot comercial travado no momento da reserva (seção 52 da spec): diária × noites + taxa
    // de limpeza. Mudanças futuras no anúncio (preço, desconto, taxa) nunca alteram retroativamente
    // uma reserva já feita.
    const nightlyRateSnapshot = listing.price;
    const cleaningFeeSnapshot = listing.cleaningFee ?? 0;
    const subtotal = nightlyRateSnapshot * nights;
    const total = subtotal + cleaningFeeSnapshot;

    // Transação serializable para prevenir race condition de reserva dupla (double-booking).
    // A verificação de sobreposição e a criação ocorrem atomicamente — se duas requisições
    // concorrentes tentarem reservar o mesmo período, uma receberá erro de serialização.
    const booking = await prisma.$transaction(async (tx) => {
      const overlapping = await tx.booking.findMany({
        where: {
          listingId,
          status: 'CONFIRMED',
          OR: [{ startDate: { lte: endDate }, endDate: { gte: startDate } }],
        },
      });

      if (overlapping.length > 0) {
        throw new Error('OVERLAP');
      }

      return tx.booking.create({
        data: {
          startDate,
          endDate,
          userId,
          listingId,
          leadId,
          price: total,
          nightlyRateSnapshot,
          nights,
          cleaningFeeSnapshot,
          subtotal,
          total,
        },
      });
    }, { isolationLevel: 'Serializable' });

    // Contato da reserva: dono, na pessoa física; responsável atual do Lead, na organização
    // (seção 108/146 da spec — não mais `ownerId ?? agentId`, que ficava travado no criador do
    // imóvel e nunca acompanhava reatribuição do Lead no CRM).
    let contactId: string | null = listing.ownerId;
    if (leadId) {
      const currentAssignment = await getCurrentAssignment(leadId);
      if (currentAssignment) {
        const broker = await prisma.organizationMember.findUnique({ where: { id: currentAssignment.brokerId } });
        contactId = broker?.userId ?? null;
      }
    }

    if (contactId) {
      await sendNotification({
        userId: contactId,
        title: 'Nova Solicitação de Reserva',
        message: `Uma nova solicitação para "${listing.name}" de ${new Date(startDate).toLocaleDateString()} a ${new Date(endDate).toLocaleDateString()}.`,
        type: 'BOOKING',
      });
    }

    // A conversa e o card da solicitação existem SEMPRE — antes, imóvel de organização com Lead
    // ainda sem corretor atribuído ficava sem conversa e sem card (a reserva existia "invisível" no
    // chat). Sem responsável, a conversa nasce só com o hóspede e `syncConversationParticipant`
    // (lib/leads.ts) adiciona o corretor quando o Lead for atribuído — ele vê o card ao entrar.
    //
    // Busca só pelo hóspede (`userId`), não pelo par [userId, contactId]: em imóvel de organização
    // o responsável muda conforme o Lead é (re)atribuído no CRM, então travar a busca no
    // `contactId` de hoje deixaria de achar a conversa já aberta e duplicaria conversa.
    let conversation = await prisma.conversation.findFirst({
      where: {
        propertyId: listingId,
        participants: { some: { id: userId } }
      },
      include: { participants: { select: { id: true } } },
    });

    if (!conversation) {
      const participantIds = contactId && contactId !== userId ? [userId, contactId] : [userId];
      conversation = await prisma.conversation.create({
        data: {
          propertyId: listingId,
          leadId,
          participants: { connect: participantIds.map((id) => ({ id })) },
        },
        include: { participants: { select: { id: true } } },
      });
    }

    const message = await prisma.message.create({
      data: {
        content: `Solicitação de Reserva: ${new Date(startDate).toLocaleDateString()} até ${new Date(endDate).toLocaleDateString()}`,
        type: 'BOOKING_REQUEST',
        metadata: JSON.stringify({ bookingId: booking.id, startDate, endDate }),
        senderId: userId,
        conversationId: conversation.id
      },
      include: { sender: { select: { id: true, name: true, avatar: true } } }
    });

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date() }
    });

    emitToRooms(conversation.participants.map((p) => p.id), 'receiveMessage', message);

    return reply.status(201).send({ booking, conversationId: conversation.id });
  } catch (error) {
    if (error instanceof Error && error.message === 'OVERLAP') {
      return reply.status(400).send({ error: 'O imóvel já está reservado neste período.' });
    }
    console.error('Booking Error:', error);
    return reply.status(500).send({ error: 'Erro ao criar reserva.' });
  }
}

export async function getBookings(request: FastifyRequest, reply: FastifyReply) {
  const { id: listingId } = request.params as { id: string };

  try {
    const bookings = await prisma.booking.findMany({
      where: { 
        listingId,
        status: 'CONFIRMED'
      },
      select: {
        startDate: true,
        endDate: true
      }
    });

    return reply.send(bookings);
  } catch (error) {
    return reply.status(500).send({ error: 'Erro ao buscar reservas.' });
  }
}

/**
 * Avisa as duas telas que o card de solicitação de reserva mudou de estado — antes só quem clicou
 * via a mudança; o outro participante só via depois de recarregar a conversa.
 */
async function emitBookingCardUpdates(conversationId: string, bookingId: string, type: string) {
  const [messages, conversation] = await Promise.all([
    prisma.message.findMany({
      where: { conversationId, type, metadata: { contains: bookingId } },
      select: { id: true, type: true, conversationId: true },
    }),
    prisma.conversation.findUnique({ where: { id: conversationId }, include: { participants: { select: { id: true } } } }),
  ]);
  try {
    const io = getIO();
    for (const participant of conversation?.participants ?? []) {
      for (const message of messages) io.to(`room_${participant.id}`).emit('messageUpdated', message);
    }
  } catch {}
}

/**
 * Núcleo de "aprovar reserva" sem depender de FastifyRequest/Reply — reaproveitado pelo endpoint
 * HTTP (`approveBooking`) e pelo comando de chat `/aprovar` (`socket.ts`, fallback pra quando o
 * botão não aparece/não é clicável). Mesma checagem de permissão dos dois caminhos.
 */
export async function approveBookingCore(userId: string, bookingId: string): Promise<{ status: number; body: unknown }> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { listing: true }
  });

  if (!booking) return { status: 404, body: { error: 'Reserva não encontrada.' } };
  if (!(await canManageListingConversation(userId, booking.listing, [booking.userId]))) {
    return { status: 403, body: { error: 'Sem permissão.' } };
  }
  // Antes não checava: um card antigo (ou o comando /aprovar) confirmava reserva já cancelada.
  if (booking.status !== 'PENDING') {
    return { status: 409, body: { error: 'Esta reserva não está mais pendente.' } };
  }

  // Mesma checagem de conflito da criação/aceite de negociação, atômica com a confirmação.
  let updated;
  try {
    updated = await prisma.$transaction(async (tx) => {
      const overlapping = await tx.booking.count({
        where: {
          listingId: booking.listingId,
          status: 'CONFIRMED',
          id: { not: booking.id },
          startDate: { lte: booking.endDate },
          endDate: { gte: booking.startDate },
        },
      });
      if (overlapping > 0) throw new Error('OVERLAP');
      const result = await tx.booking.updateMany({ where: { id: bookingId, status: 'PENDING' }, data: { status: 'CONFIRMED' } });
      if (result.count === 0) throw new Error('STALE');
      return tx.booking.findUniqueOrThrow({ where: { id: bookingId } });
    }, { isolationLevel: 'Serializable' });
  } catch (error) {
    if (error instanceof Error && error.message === 'OVERLAP') {
      return { status: 400, body: { error: 'As datas desta reserva já foram ocupadas por outra reserva confirmada.' } };
    }
    if (error instanceof Error && error.message === 'STALE') {
      return { status: 409, body: { error: 'Esta reserva não está mais pendente.' } };
    }
    throw error;
  }
  await closeNegotiationsForBooking(bookingId);

  try {
    await closeLeadForDealOutcome(userId, booking.listing, booking.userId, 'WON');
  } catch (err) {
    console.error('Falha ao mover o Lead automaticamente pra WON após aprovar reserva:', err);
  }

  await sendNotification({
    userId: booking.userId,
    title: 'Reserva Aprovada! 🎉',
    message: `Sua reserva para "${booking.listing.name}" foi aprovada pelo anfitrião.`,
    type: 'BOOKING',
  });

  await resolveBookingInChat(
    booking,
    userId,
    'BOOKING_APPROVED',
    `✅ O anfitrião aprovou sua solicitação de reserva para o período de ${new Date(booking.startDate).toLocaleDateString()} a ${new Date(booking.endDate).toLocaleDateString()}.`
  );

  return { status: 200, body: updated };
}

/** Espelho de `approveBookingCore` pra recusar. */
export async function rejectBookingCore(userId: string, bookingId: string): Promise<{ status: number; body: unknown }> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { listing: true }
  });

  if (!booking) return { status: 404, body: { error: 'Reserva não encontrada.' } };
  if (!(await canManageListingConversation(userId, booking.listing, [booking.userId]))) {
    return { status: 403, body: { error: 'Sem permissão.' } };
  }

  const result = await prisma.booking.updateMany({ where: { id: bookingId, status: 'PENDING' }, data: { status: 'REJECTED' } });
  if (result.count === 0) {
    return { status: 409, body: { error: 'Esta reserva não está mais pendente.' } };
  }
  const updated = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
  await closeNegotiationsForBooking(bookingId);

  await sendNotification({
    userId: booking.userId,
    title: 'Reserva Recusada',
    message: `Sua reserva para "${booking.listing.name}" foi recusada pelo anfitrião.`,
    type: 'SYSTEM',
  });

  await resolveBookingInChat(booking, userId, 'BOOKING_REJECTED', `❌ O anfitrião recusou a solicitação de reserva.`);

  return { status: 200, body: updated };
}

export async function approveBooking(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const user = request.user as { id: string };
  try {
    const { status, body } = await approveBookingCore(user.id, id);
    return reply.status(status).send(body);
  } catch (error) {
    console.error('Approve Booking Error:', error);
    return reply.status(500).send({ error: 'Erro ao aprovar reserva.' });
  }
}

export async function rejectBooking(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const user = request.user as { id: string };
  try {
    const { status, body } = await rejectBookingCore(user.id, id);
    return reply.status(status).send(body);
  } catch (error) {
    console.error('Reject Booking Error:', error);
    return reply.status(500).send({ error: 'Erro ao recusar reserva.' });
  }
}

export async function cancelBooking(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const user = request.user as { id: string };

  try {
    const booking = await prisma.booking.findUnique({
      where: { id },
      include: { listing: true }
    });

    if (!booking) return reply.status(404).send({ error: 'Reserva não encontrada.' });
    const isGuest = booking.userId === user.id;
    // Lado do anúncio: dono (pessoa física) ou quem gerencia a conversa na organização — antes só
    // `ownerId`, então imóvel de organização (que nunca tem `ownerId`) não podia cancelar.
    if (!isGuest && !(await canManageListingConversation(user.id, booking.listing, [booking.userId]))) {
      return reply.status(403).send({ error: 'Sem permissão.' });
    }

    if (booking.status === 'CANCELLED' || booking.status === 'REJECTED') {
      return reply.status(400).send({ error: 'Reserva já está cancelada ou recusada.' });
    }

    const updated = await prisma.booking.update({
      where: { id },
      data: { status: 'CANCELLED' }
    });
    await closeNegotiationsForBooking(id);

    // Notifica o outro lado: o hóspede, ou os outros participantes da conversa (o dono, ou o
    // corretor responsável na organização).
    const conversation = await findGuestConversation(booking.listingId, booking.userId);
    const targetUserIds = isGuest
      ? (conversation?.participants.map((p) => p.id).filter((pid) => pid !== user.id) ??
          (booking.listing.ownerId ? [booking.listing.ownerId] : []))
      : [booking.userId];

    for (const targetUserId of new Set(targetUserIds)) {
      await sendNotification({
        userId: targetUserId,
        title: 'Reserva Cancelada',
        message: isGuest
          ? `O hóspede cancelou a reserva para "${booking.listing.name}".`
          : `O anfitrião cancelou sua reserva para "${booking.listing.name}".`,
        type: 'SYSTEM',
      });
    }

    await resolveBookingInChat(booking, user.id, 'BOOKING_CANCELLED', `🚫 ${isGuest ? 'O hóspede' : 'O anfitrião'} cancelou a reserva.`);

    return reply.send(updated);
  } catch (error) {
    console.error('Cancel Booking Error:', error);
    return reply.status(500).send({ error: 'Erro ao cancelar reserva.' });
  }
}

// ─── DESCONTO PONTUAL NUMA RESERVA (requer ser dono do imóvel, ou OWNER/ADMIN/corretor        ─
// responsável da organização) — distinto do desconto do anúncio: só afeta esta reserva.       ─

export async function setBookingDiscount(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const user = request.user as { id: string };

  const schema = z.object({ discountedPrice: z.number().positive().nullable() });
  const parsed = schema.safeParse(request.body);
  if (!parsed.success) return reply.status(400).send({ error: parsed.error.errors });

  try {
    const booking = await prisma.booking.findUnique({ where: { id }, include: { listing: true } });
    if (!booking) return reply.status(404).send({ error: 'Reserva não encontrada.' });

    const isOwner = booking.listing.ownerId === user.id;
    if (!isOwner && !(await canManageOrgListing(user.id, booking.listing))) {
      return reply.status(403).send({ error: 'Sem permissão.' });
    }

    const updated = await prisma.booking.update({
      where: { id },
      data: { discountedPrice: parsed.data.discountedPrice },
    });

    await sendNotification({
      userId: booking.userId,
      title: parsed.data.discountedPrice ? 'Desconto aplicado na sua reserva! 🎉' : 'Desconto removido da sua reserva',
      message: parsed.data.discountedPrice
        ? `O anfitrião aplicou um desconto na sua reserva para "${booking.listing.name}".`
        : `O desconto especial da sua reserva para "${booking.listing.name}" foi removido.`,
      type: 'BOOKING',
    });

    return reply.send(updated);
  } catch (error) {
    return reply.status(500).send({ error: 'Erro ao atualizar desconto da reserva.' });
  }
}
