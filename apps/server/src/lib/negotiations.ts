import { Prisma } from '@prisma/client';
import { prisma } from './prisma.js';
import { canManageListingConversation, advanceLeadBySystem } from './leads.js';
import { sendNotification } from '../services/notification.service.js';
import { getIO } from '../socket.js';

/**
 * ─── NEGOCIAÇÃO DE VALOR NO CHAT ─────────────────────────────────────────────────────────────
 * Uma Negotiation por conversa aberta de cada vez (índice único parcial no banco), com rodadas
 * (Offer) que alternam entre os dois lados: o CLIENTE e o lado do ANÚNCIO (dono na pessoa física;
 * quem `canManageListingConversation` aprova na organização). Só existe uma rodada PENDING por
 * vez e só o lado que NÃO a propôs pode aceitar, recusar ou contrapropor.
 *
 * Efeito do aceite por modalidade (decisões aprovadas no doc de arquitetura):
 * - SALE: imóvel vira SOLD, as outras negociações do imóvel são encerradas, Lead → WON.
 * - DAILY_RENT: o valor vira `booking.discountedPrice` e a reserva é confirmada (checando
 *   conflito de datas), Lead → WON.
 * - MONTHLY_RENT: só registra o valor acordado (não há contrato de aluguel no sistema).
 *
 * Todas as funções devolvem `{ status, body }` (mesmo padrão de approveBookingCore), pra serem
 * usadas tanto pelas rotas HTTP quanto pelos comandos de chat em socket.ts.
 */

export const ROUND_TTL_MS = 48 * 60 * 60 * 1000;
export const MAX_ROUNDS = 10;

type Side = 'CUSTOMER' | 'LISTING';
type Result = { status: number; body: unknown };

const fail = (status: number, error: string): Result => ({ status, body: { error } });

const formatBRL = (value: number) =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 });

const UNIT_BY_OPERATION: Record<string, 'TOTAL' | 'MONTHLY'> = {
  SALE: 'TOTAL',
  MONTHLY_RENT: 'MONTHLY',
  DAILY_RENT: 'TOTAL',
};

const senderSelect = { select: { id: true, name: true, avatar: true } } as const;

// ─── Leitura ────────────────────────────────────────────────────────────────────────────────

const negotiationInclude = {
  offers: {
    orderBy: { createdAt: 'asc' as const },
    include: { proposedBy: { select: { id: true, name: true } } },
  },
};

type NegotiationWithOffers = Prisma.NegotiationGetPayload<{ include: typeof negotiationInclude }>;

/** Forma pública (mesma pros dois lados — nunca carrega o piso do anúncio). */
function toSnapshot(negotiation: NegotiationWithOffers) {
  return {
    id: negotiation.id,
    conversationId: negotiation.conversationId,
    listingId: negotiation.listingId,
    customerId: negotiation.customerId,
    bookingId: negotiation.bookingId,
    operationType: negotiation.operationType,
    status: negotiation.status,
    referencePrice: negotiation.referencePrice,
    agreedValue: negotiation.agreedValue,
    createdAt: negotiation.createdAt,
    rounds: negotiation.offers.map((offer) => ({
      id: offer.id,
      value: offer.value,
      unit: offer.unit,
      paymentMethod: offer.paymentMethod,
      status: offer.status,
      expiresAt: offer.expiresAt,
      previousOfferId: offer.previousOfferId,
      proposedById: offer.proposedById,
      proposedByName: offer.proposedBy.name,
      side: (offer.proposedById === negotiation.customerId ? 'CUSTOMER' : 'LISTING') as Side,
      createdAt: offer.createdAt,
    })),
  };
}

export type NegotiationSnapshot = ReturnType<typeof toSnapshot>;

async function loadSnapshot(negotiationId: string): Promise<NegotiationSnapshot> {
  const negotiation = await prisma.negotiation.findUniqueOrThrow({
    where: { id: negotiationId },
    include: negotiationInclude,
  });
  return toSnapshot(negotiation);
}

/**
 * Expiração preguiçosa: sem job agendado, toda leitura/escrita passa por aqui antes e fecha a
 * rodada PENDING vencida (e a negociação junto).
 */
async function expireStaleRounds(where: Prisma.NegotiationWhereInput): Promise<void> {
  const stale = await prisma.offer.findMany({
    where: { status: 'PENDING', expiresAt: { lt: new Date() }, negotiation: { ...where, status: 'OPEN' } },
    select: { id: true, negotiationId: true },
  });
  for (const offer of stale) {
    await prisma.$transaction([
      prisma.offer.updateMany({ where: { id: offer.id, status: 'PENDING' }, data: { status: 'EXPIRED' } }),
      prisma.negotiation.updateMany({ where: { id: offer.negotiationId, status: 'OPEN' }, data: { status: 'EXPIRED' } }),
    ]);
  }
}

export async function listConversationNegotiations(
  userId: string,
  userRole: string,
  conversationId: string
): Promise<Result> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { participants: { select: { id: true } } },
  });
  if (!conversation) return fail(404, 'Conversa não encontrada.');
  if (userRole !== 'ADMIN' && !conversation.participants.some((p) => p.id === userId)) {
    return fail(403, 'Sem permissão.');
  }

  await expireStaleRounds({ conversationId });
  const negotiations = await prisma.negotiation.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'asc' },
    include: negotiationInclude,
  });
  return { status: 200, body: negotiations.map(toSnapshot) };
}

/**
 * Reserva aprovada, recusada ou cancelada por fora da negociação (botões de reserva, painel):
 * a negociação de valor dela perde o objeto e é encerrada, com a rodada pendente cancelada.
 */
export async function closeNegotiationsForBooking(bookingId: string): Promise<void> {
  const open = await prisma.negotiation.findMany({
    where: { bookingId, status: 'OPEN' },
    include: { conversation: { include: { participants: { select: { id: true } } } } },
  });
  for (const negotiation of open) {
    await prisma.$transaction([
      prisma.offer.updateMany({ where: { negotiationId: negotiation.id, status: 'PENDING' }, data: { status: 'CANCELLED' } }),
      prisma.negotiation.update({ where: { id: negotiation.id }, data: { status: 'CLOSED' } }),
    ]);
    const participantIds = negotiation.conversation?.participants.map((p) => p.id) ?? [];
    emitToParticipants(participantIds, 'negotiationUpdated', await loadSnapshot(negotiation.id));
  }
}

// ─── Partes ─────────────────────────────────────────────────────────────────────────────────

/** O cliente da conversa: o dono do Lead (organização) ou quem não é o dono (pessoa física). */
async function resolveCustomerId(conversation: {
  leadId: string | null;
  participants: { id: string }[];
  property: { ownerId: string | null };
}): Promise<string | null> {
  if (conversation.leadId) {
    const lead = await prisma.lead.findUnique({ where: { id: conversation.leadId }, select: { userId: true } });
    if (lead) return lead.userId;
  }
  if (conversation.property.ownerId) {
    return conversation.participants.find((p) => p.id !== conversation.property.ownerId)?.id ?? null;
  }
  return null;
}

async function resolveSide(
  actorId: string,
  customerId: string,
  listing: { id: string; ownerId: string | null; organizationId: string | null }
): Promise<Side | null> {
  if (actorId === customerId) return 'CUSTOMER';
  return (await canManageListingConversation(actorId, listing, [customerId])) ? 'LISTING' : null;
}

function emitToParticipants(participantIds: string[], event: string, payload: unknown) {
  try {
    const io = getIO();
    for (const id of participantIds) io.to(`room_${id}`).emit(event, payload);
  } catch {
    // socket não inicializado (ex.: scripts) — o estado já está no banco
  }
}

async function postSystemText(conversationId: string, senderId: string, content: string, participantIds: string[]) {
  const message = await prisma.message.create({
    data: { content, type: 'TEXT', senderId, conversationId },
    include: { sender: senderSelect },
  });
  await prisma.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
  emitToParticipants(participantIds, 'receiveMessage', message);
  return message;
}

async function notifyOthers(participantIds: string[], actorId: string, title: string, message: string) {
  for (const userId of participantIds) {
    if (userId === actorId) continue;
    await sendNotification({ userId, title, message, type: 'INFO' });
  }
}

// ─── Propor / contrapropor ──────────────────────────────────────────────────────────────────

export async function proposeRound({
  actorId,
  conversationId,
  value,
  paymentMethod,
}: {
  actorId: string;
  conversationId: string;
  value: number;
  paymentMethod?: string | null | undefined;
}): Promise<Result> {
  if (!Number.isFinite(value) || value <= 0) return fail(400, 'Informe um valor maior que zero.');

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { participants: { select: { id: true } }, property: { select: { ownerId: true } } },
  });
  if (!conversation || !conversation.participants.some((p) => p.id === actorId)) {
    return fail(404, 'Conversa não encontrada.');
  }
  if (conversation.isClosed) return fail(400, 'Esta conversa foi encerrada.');

  // Único lugar (junto da edição pelo anunciante) que lê o piso sigiloso.
  const listing = await prisma.listing.findUniqueOrThrow({
    where: { id: conversation.propertyId },
    omit: { minNegotiablePrice: false },
  });
  if (!listing.acceptsNegotiation) return fail(400, 'Este anúncio não aceita negociação de valor.');
  if (listing.status !== 'APPROVED') return fail(400, 'Este anúncio não está disponível para negociação.');

  const customerId = await resolveCustomerId(conversation);
  if (!customerId) return fail(400, 'Não foi possível identificar o cliente desta conversa.');
  const side = await resolveSide(actorId, customerId, listing);
  if (!side) return fail(403, 'Sem permissão para negociar nesta conversa.');

  const unit = UNIT_BY_OPERATION[listing.operationType] ?? 'TOTAL';
  const participantIds = conversation.participants.map((p) => p.id);

  await expireStaleRounds({ conversationId });
  const open = await prisma.negotiation.findFirst({
    where: { conversationId, status: 'OPEN' },
    include: { offers: true, booking: true },
  });

  const pending = open?.offers.find((o) => o.status === 'PENDING') ?? null;
  if (pending) {
    const pendingSide: Side = pending.proposedById === customerId ? 'CUSTOMER' : 'LISTING';
    if (pendingSide === side) return fail(409, 'Aguarde a resposta da outra parte à proposta pendente.');
  }
  if (open && open.offers.length >= MAX_ROUNDS) {
    return fail(400, `Limite de ${MAX_ROUNDS} rodadas atingido. Aceite ou recuse a última proposta.`);
  }

  // Diária: negocia-se o total de uma reserva PENDING já solicitada pelo cliente.
  let booking = open?.booking ?? null;
  if (!open && listing.operationType === 'DAILY_RENT') {
    booking = await prisma.booking.findFirst({
      where: { listingId: listing.id, userId: customerId, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
    });
    if (!booking) {
      return fail(400, 'Para negociar uma diária, primeiro solicite as datas da reserva no anúncio.');
    }
  }

  // Piso sigiloso: proposta do cliente abaixo dele é recusada na hora, sem revelar o valor. Na
  // diária o piso é por noite.
  if (side === 'CUSTOMER' && listing.minNegotiablePrice != null) {
    const comparable = listing.operationType === 'DAILY_RENT' && booking?.nights ? value / booking.nights : value;
    if (comparable < listing.minNegotiablePrice) {
      return fail(400, 'O anunciante não aceita propostas abaixo de um valor mínimo para este imóvel. Tente um valor maior.');
    }
  }

  const effectivePaymentMethod = listing.operationType === 'SALE' ? paymentMethod?.trim() || null : null;

  let negotiationId: string;
  let offerId: string;
  try {
    const result = await prisma.$transaction(async (tx) => {
      let negotiation = open;
      if (!negotiation) {
        const referencePrice =
          listing.operationType === 'DAILY_RENT' && booking
            ? booking.discountedPrice ?? booking.total ?? booking.price ?? listing.price
            : listing.price;
        negotiation = await tx.negotiation.create({
          data: {
            operationType: listing.operationType,
            referencePrice,
            listingId: listing.id,
            conversationId,
            customerId,
            leadId: conversation.leadId,
            bookingId: booking?.id ?? null,
          },
          include: { offers: true, booking: true },
        });
      }

      if (pending) {
        const countered = await tx.offer.updateMany({
          where: { id: pending.id, status: 'PENDING' },
          data: { status: 'COUNTERED' },
        });
        if (countered.count === 0) throw new Error('STALE');
      }

      const offer = await tx.offer.create({
        data: {
          value,
          unit,
          paymentMethod: effectivePaymentMethod,
          expiresAt: new Date(Date.now() + ROUND_TTL_MS),
          listingId: listing.id,
          buyerId: customerId,
          proposedById: actorId,
          negotiationId: negotiation.id,
          previousOfferId: pending?.id ?? null,
          leadId: conversation.leadId,
        },
      });
      return { negotiationId: negotiation.id, offerId: offer.id };
    });
    negotiationId = result.negotiationId;
    offerId = result.offerId;
  } catch (error) {
    // STALE: a rodada pendente mudou no meio (outro aceite/contraproposta). P2002: duas
    // aberturas concorrentes na mesma conversa esbarraram no índice único parcial.
    if ((error instanceof Error && error.message === 'STALE') ||
        (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) {
      return fail(409, 'A negociação foi atualizada por outra pessoa. Recarregue a conversa.');
    }
    throw error;
  }

  const isCounter = !!pending;
  const unitSuffix = unit === 'MONTHLY' ? '/mês' : '';
  const label = isCounter ? 'Contraproposta' : 'Proposta';
  const message = await prisma.message.create({
    data: {
      content: `${label}: ${formatBRL(value)}${unitSuffix}${effectivePaymentMethod ? ` via ${effectivePaymentMethod}` : ''}`,
      type: 'NEGOTIATION_ROUND',
      metadata: JSON.stringify({ negotiationId, offerId }),
      senderId: actorId,
      conversationId,
    },
    include: { sender: senderSelect },
  });
  await prisma.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });

  const snapshot = await loadSnapshot(negotiationId);
  emitToParticipants(participantIds, 'receiveMessage', message);
  emitToParticipants(participantIds, 'negotiationUpdated', snapshot);

  await notifyOthers(
    participantIds,
    actorId,
    isCounter ? 'Nova contraproposta' : 'Nova proposta de valor',
    `${message.sender.name}: ${formatBRL(value)}${unitSuffix} para "${listing.name}".`
  );

  if (conversation.leadId) {
    try {
      await advanceLeadBySystem(
        conversation.leadId,
        isCounter ? 'NEGOTIATION' : 'PROPOSAL',
        isCounter ? 'contraproposta no chat' : 'proposta de valor no chat'
      );
    } catch (err) {
      console.error('Falha ao avançar o Lead após rodada de negociação:', err);
    }
  }

  return { status: 201, body: { negotiation: snapshot, message } };
}

// ─── Responder ──────────────────────────────────────────────────────────────────────────────

export type RoundAction = 'ACCEPT' | 'REJECT' | 'WITHDRAW';

export async function respondToRound({
  actorId,
  offerId,
  action,
}: {
  actorId: string;
  offerId: string;
  action: RoundAction;
}): Promise<Result> {
  const initial = await prisma.offer.findUnique({ where: { id: offerId }, select: { negotiationId: true } });
  if (!initial) return fail(404, 'Proposta não encontrada.');
  await expireStaleRounds({ id: initial.negotiationId });

  const offer = await prisma.offer.findUniqueOrThrow({
    where: { id: offerId },
    include: { negotiation: { include: { booking: true } }, listing: true },
  });
  const { negotiation, listing } = offer;
  if (offer.status !== 'PENDING' || negotiation.status !== 'OPEN') {
    return fail(409, 'Esta proposta não está mais pendente.');
  }

  const side = await resolveSide(actorId, negotiation.customerId, listing);
  if (!side) return fail(403, 'Sem permissão.');
  const proposerSide: Side = offer.proposedById === negotiation.customerId ? 'CUSTOMER' : 'LISTING';
  if (action === 'WITHDRAW' ? side !== proposerSide : side === proposerSide) {
    return fail(403, action === 'WITHDRAW' ? 'Só quem propôs pode retirar a proposta.' : 'Aguarde a resposta da outra parte.');
  }

  const conversation = negotiation.conversationId
    ? await prisma.conversation.findUnique({
        where: { id: negotiation.conversationId },
        include: { participants: { select: { id: true } } },
      })
    : null;
  const participantIds = conversation?.participants.map((p) => p.id) ?? [negotiation.customerId, actorId];
  const actor = await prisma.user.findUniqueOrThrow({ where: { id: actorId }, select: { name: true } });
  const unitSuffix = offer.unit === 'MONTHLY' ? '/mês' : '';
  const valueText = `${formatBRL(offer.value)}${unitSuffix}`;

  let resolutionText: string;
  let notificationTitle: string;

  try {
    if (action === 'ACCEPT') {
      await acceptRound(offer, negotiation, listing);
      const effect =
        negotiation.operationType === 'SALE'
          ? ' O imóvel foi marcado como vendido.'
          : negotiation.operationType === 'DAILY_RENT'
            ? ' A reserva foi confirmada com esse valor.'
            : '';
      resolutionText = `✅ ${actor.name} aceitou a proposta de ${valueText}.${effect}`;
      notificationTitle = 'Proposta aceita! 🎉';
    } else {
      const nextStatus = action === 'REJECT' ? 'REJECTED' : 'WITHDRAWN';
      await prisma.$transaction(async (tx) => {
        const updated = await tx.offer.updateMany({ where: { id: offer.id, status: 'PENDING' }, data: { status: nextStatus } });
        if (updated.count === 0) throw new Error('STALE');
        await tx.negotiation.update({ where: { id: negotiation.id }, data: { status: 'CLOSED' } });
      });
      resolutionText =
        action === 'REJECT'
          ? `❌ ${actor.name} recusou a proposta de ${valueText}.`
          : `↩️ ${actor.name} retirou a proposta de ${valueText}.`;
      notificationTitle = action === 'REJECT' ? 'Proposta recusada' : 'Proposta retirada';
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'STALE') return fail(409, 'Esta proposta não está mais pendente.');
    if (error instanceof Error && error.message === 'OVERLAP') {
      return fail(400, 'As datas desta reserva já foram ocupadas por outra reserva confirmada.');
    }
    if (error instanceof Error && error.message === 'BOOKING_NOT_PENDING') {
      return fail(400, 'A reserva desta negociação não está mais pendente.');
    }
    if (error instanceof Error && error.message === 'ALREADY_SOLD') return fail(400, 'Este imóvel já foi vendido.');
    throw error;
  }

  if (conversation) {
    // Cards do fluxo antigo (OFFER_REQUEST) ligados a esta Offer passam a mostrar o desfecho.
    if (action !== 'WITHDRAW') {
      await prisma.message.updateMany({
        where: { conversationId: conversation.id, type: 'OFFER_REQUEST', metadata: { contains: offer.id } },
        data: { type: action === 'ACCEPT' ? 'OFFER_APPROVED' : 'OFFER_REJECTED' },
      });
    }
    await postSystemText(conversation.id, actorId, resolutionText, participantIds);
  }

  const snapshot = await loadSnapshot(negotiation.id);
  emitToParticipants(participantIds, 'negotiationUpdated', snapshot);
  await notifyOthers(participantIds, actorId, notificationTitle, `${resolutionText} ("${listing.name}")`);

  return { status: 200, body: snapshot };
}

type OfferRow = { id: string; value: number };
type NegotiationRow = {
  id: string;
  operationType: string;
  customerId: string;
  leadId: string | null;
  conversationId: string | null;
  booking: { id: string; status: string; startDate: Date; endDate: Date } | null;
};
type ListingRow = { id: string; status: string };

async function acceptRound(offer: OfferRow, negotiation: NegotiationRow, listing: ListingRow): Promise<void> {
  const markAccepted = async (tx: Prisma.TransactionClient) => {
    const updated = await tx.offer.updateMany({ where: { id: offer.id, status: 'PENDING' }, data: { status: 'ACCEPTED' } });
    if (updated.count === 0) throw new Error('STALE');
    await tx.negotiation.update({ where: { id: negotiation.id }, data: { status: 'AGREED', agreedValue: offer.value } });
  };

  if (negotiation.operationType === 'SALE') {
    await prisma.$transaction(async (tx) => {
      const current = await tx.listing.findUniqueOrThrow({ where: { id: listing.id }, select: { status: true } });
      if (current.status === 'SOLD') throw new Error('ALREADY_SOLD');
      await markAccepted(tx);
      // Vendido: encerra as outras negociações do imóvel e cancela as rodadas pendentes delas.
      await tx.offer.updateMany({
        where: { listingId: listing.id, status: 'PENDING', id: { not: offer.id } },
        data: { status: 'CANCELLED' },
      });
      await tx.negotiation.updateMany({
        where: { listingId: listing.id, status: 'OPEN', id: { not: negotiation.id } },
        data: { status: 'CLOSED' },
      });
      await tx.listing.update({ where: { id: listing.id }, data: { status: 'SOLD' } });
    });
  } else if (negotiation.operationType === 'DAILY_RENT') {
    const booking = negotiation.booking;
    if (!booking) throw new Error('BOOKING_NOT_PENDING');
    // Serializable, igual à criação da reserva: checagem de conflito + confirmação atômicas.
    await prisma.$transaction(async (tx) => {
      const current = await tx.booking.findUniqueOrThrow({ where: { id: booking.id } });
      if (current.status !== 'PENDING') throw new Error('BOOKING_NOT_PENDING');
      const overlapping = await tx.booking.count({
        where: {
          listingId: listing.id,
          status: 'CONFIRMED',
          id: { not: booking.id },
          startDate: { lte: current.endDate },
          endDate: { gte: current.startDate },
        },
      });
      if (overlapping > 0) throw new Error('OVERLAP');
      await markAccepted(tx);
      await tx.booking.update({ where: { id: booking.id }, data: { status: 'CONFIRMED', discountedPrice: offer.value } });
    }, { isolationLevel: 'Serializable' });

    if (negotiation.conversationId) {
      await prisma.message.updateMany({
        where: { conversationId: negotiation.conversationId, type: 'BOOKING_REQUEST', metadata: { contains: booking.id } },
        data: { type: 'BOOKING_APPROVED' },
      });
      const updatedMessages = await prisma.message.findMany({
        where: { conversationId: negotiation.conversationId, type: 'BOOKING_APPROVED', metadata: { contains: booking.id } },
        select: { id: true, type: true, conversationId: true },
      });
      const conversation = await prisma.conversation.findUnique({
        where: { id: negotiation.conversationId },
        include: { participants: { select: { id: true } } },
      });
      for (const m of updatedMessages) {
        emitToParticipants(conversation?.participants.map((p) => p.id) ?? [], 'messageUpdated', m);
      }
    }
  } else {
    await prisma.$transaction(async (tx) => markAccepted(tx));
  }

  if (negotiation.leadId && negotiation.operationType !== 'MONTHLY_RENT') {
    try {
      await advanceLeadBySystem(negotiation.leadId, 'WON', 'negociação aceita no chat');
    } catch (err) {
      console.error('Falha ao mover o Lead pra WON após aceite de negociação:', err);
    }
  }
}
