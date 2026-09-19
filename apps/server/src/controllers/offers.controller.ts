import type { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { sendNotification } from '../services/notification.service.js';
import { getIO } from '../socket.js';
import { canManageListingConversation, closeLeadForDealOutcome } from '../lib/leads.js';

export async function createOffer(request: FastifyRequest, reply: FastifyReply) {
  const { id: userId } = request.user as { id: string };
  const { id: listingId } = request.params as { id: string };

  const schema = z.object({
    value: z.number().positive(),
    paymentMethod: z.string().min(1),
  });

  const parsed = schema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({ error: parsed.error.errors });
  }

  const { value, paymentMethod } = parsed.data;

  // Garante que o imóvel de fato existe, está à venda e ainda não foi negociado/vendido
  const listing = await prisma.listing.findUnique({ where: { id: listingId } });
  if (!listing) return reply.status(404).send({ error: 'Imóvel não encontrado.' });
  if (listing.category !== 'venda') return reply.status(400).send({ error: 'Propostas só estão disponíveis para venda.' });
  if (listing.status === 'SOLD') return reply.status(400).send({ error: 'Este imóvel já foi vendido.' });

  try {
    // Cria a proposta no banco de dados para auditoria futura
    const offer = await prisma.offer.create({
      data: {
        value,
        paymentMethod,
        buyerId: userId,
        listingId,
      }
    });

    let conversation;

    // Dono da pessoa física (ownerId) ou corretor/contato responsável no caso de imóvel de
    // organização (agentId) — imóvel de imobiliária nunca tem ownerId preenchido, então o check
    // antigo (`if (listing.ownerId)`) pulava esse bloco inteiro pra qualquer proposta em imóvel
    // de organização: nenhuma notificação, nenhuma mensagem no chat, proposta ficava invisível
    // pro comprador e pra quem deveria responder. Mesmo fallback já usado em
    // chat.controller.ts/bookings.controller.ts.
    const contactId = listing.ownerId ?? listing.agentId;

    if (contactId) {
      // Dispara uma notificação push para o dono/responsável do imóvel avisando que há uma nova proposta
      await sendNotification({
        userId: contactId,
        title: 'Nova Proposta de Compra',
        message: `Você recebeu uma proposta de R$ ${value.toLocaleString('pt-BR')} para o imóvel "${listing.name}".`,
        type: 'INFO',
      });

      /**
       * ─── DETECÇÃO OU CRIAÇÃO DE CONVERSA ──────────────────────────────────────────────
       * O sistema de proposta é integrado ao chat. Busca só pelo comprador (`userId`), não pelo
       * par [userId, contactId] — em imóvel de organização o responsável muda conforme o Lead é
       * (re)atribuído no CRM (ver `assignLead`/`syncConversationParticipant` em lib/leads.ts),
       * então travar a busca no `contactId` de hoje deixaria de achar a conversa já aberta assim
       * que o corretor responsável mudasse, e duplicaria conversa.
       */
      conversation = await prisma.conversation.findFirst({
        where: {
          propertyId: listingId,
          participants: { some: { id: userId } }
        }
      });

      if (!conversation) {
        conversation = await prisma.conversation.create({
          data: {
            propertyId: listingId,
            participants: {
              connect: [{ id: userId }, { id: contactId }]
            }
          }
        });
      }

      /**
       * ─── CRIAÇÃO DA MENSAGEM ESPECIAL DE PROPOSTA ─────────────────────────────────────
       * Em vez de uma mensagem de texto simples, criamos uma mensagem com o tipo
       * `OFFER_REQUEST`. Os dados específicos da proposta (ID, valor, forma de pagamento)
       * são serializados em JSON e salvos no campo "metadata" do banco.
       * Isso permite ao app renderizar um card interativo com botões de "Aceitar" e "Recusar".
       */
      const message = await prisma.message.create({
        data: {
          content: `Proposta de Compra: R$ ${value.toLocaleString('pt-BR')} via ${paymentMethod}`,
          type: 'OFFER_REQUEST',
          metadata: JSON.stringify({ offerId: offer.id, value, paymentMethod }),
          senderId: userId,
          conversationId: conversation.id
        },
        include: { sender: { select: { id: true, name: true, avatar: true } } }
      });

      /**
       * ─── EMISSÃO VIA WEBSOCKET EM TEMPO REAL ──────────────────────────────────────────
       * Emitimos a mensagem criada para as salas individuais de ambos os participantes.
       * Isso atualiza a tela de chat do comprador (mostrando a proposta dele como enviada)
       * e do vendedor (mostrando o card interativo de proposta a ser aceito ou recusado).
       */
      try {
        const io = getIO();
        io.to(`room_${contactId}`).emit('receiveMessage', message);
        io.to(`room_${userId}`).emit('receiveMessage', message);
      } catch (e) {}

      // Atualiza o updatedAt da conversa para fins de ordenação da inbox
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { updatedAt: new Date() }
      });
    }

    return reply.status(201).send({ offer, conversationId: conversation?.id });
  } catch (error) {
    console.error('Offer Creation Error:', error);
    return reply.status(500).send({ error: 'Erro ao criar proposta.' });
  }
}

/**
 * Núcleo de "aprovar proposta" sem depender de FastifyRequest/Reply — reaproveitado pelo endpoint
 * HTTP (`approveOffer`) e pelo comando de chat `/aprovar` (`socket.ts`, fallback pra quando o
 * botão não aparece/não é clicável). Mesma checagem de permissão dos dois caminhos.
 */
export async function approveOfferCore(userId: string, offerId: string): Promise<{ status: number; body: unknown }> {
  const offer = await prisma.offer.findUnique({
    where: { id: offerId },
    include: { listing: true }
  });

  if (!offer) return { status: 404, body: { error: 'Proposta não encontrada.' } };
  // Dono do imóvel (pessoa física) ou, no caso de organização, quem pode agir no Lead do
  // comprador (OWNER/ADMIN/MANAGER ou o corretor responsável — ver canManageListingConversation).
  if (!(await canManageListingConversation(userId, offer.listing, [offer.buyerId]))) {
    return { status: 403, body: { error: 'Sem permissão.' } };
  }

  const updated = await prisma.offer.update({
    where: { id: offerId },
    data: { status: 'ACCEPTED' }
  });

  // Quando uma proposta é aceita, o imóvel é marcado como 'SOLD' — impede novas propostas no
  // mesmo anúncio e bloqueia novas conversações sobre ele.
  await prisma.listing.update({
    where: { id: offer.listingId },
    data: { status: 'SOLD' }
  });

  try {
    await closeLeadForDealOutcome(userId, offer.listing, offer.buyerId, 'WON');
  } catch (err) {
    console.error('Falha ao mover o Lead automaticamente pra WON após aprovar proposta:', err);
  }

  await sendNotification({
    userId: offer.buyerId,
    title: 'Proposta Aceita! 🎉',
    message: `Sua proposta para o imóvel "${offer.listing.name}" foi aceita pelo proprietário.`,
    type: 'INFO',
  });

  const conversation = await prisma.conversation.findFirst({
    where: {
      propertyId: offer.listingId,
      participants: { every: { id: { in: [offer.buyerId, userId] } } }
    }
  });

  if (conversation) {
    await prisma.message.updateMany({
      where: { conversationId: conversation.id, type: 'OFFER_REQUEST', metadata: { contains: offerId } },
      data: { type: 'OFFER_APPROVED' }
    });

    const message = await prisma.message.create({
      data: {
        content: `✅ O proprietário aceitou sua proposta de R$ ${offer.value.toLocaleString('pt-BR')} via ${offer.paymentMethod}!`,
        type: 'TEXT',
        senderId: userId,
        conversationId: conversation.id
      },
      include: { sender: { select: { id: true, name: true, avatar: true } } }
    });

    await prisma.conversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } });

    try {
      const io = getIO();
      io.to(`room_${offer.buyerId}`).emit('receiveMessage', message);
      io.to(`room_${userId}`).emit('receiveMessage', message);
    } catch (e) {}
  }

  return { status: 200, body: updated };
}

/** Espelho de `approveOfferCore` pra recusar. */
export async function rejectOfferCore(userId: string, offerId: string): Promise<{ status: number; body: unknown }> {
  const offer = await prisma.offer.findUnique({
    where: { id: offerId },
    include: { listing: true }
  });

  if (!offer) return { status: 404, body: { error: 'Proposta não encontrada.' } };
  if (!(await canManageListingConversation(userId, offer.listing, [offer.buyerId]))) {
    return { status: 403, body: { error: 'Sem permissão.' } };
  }

  const updated = await prisma.offer.update({
    where: { id: offerId },
    data: { status: 'REJECTED' }
  });

  await sendNotification({
    userId: offer.buyerId,
    title: 'Proposta Recusada',
    message: `Sua proposta para o imóvel "${offer.listing.name}" foi recusada pelo proprietário.`,
    type: 'INFO',
  });

  const conversation = await prisma.conversation.findFirst({
    where: {
      propertyId: offer.listingId,
      participants: { every: { id: { in: [offer.buyerId, userId] } } }
    }
  });

  if (conversation) {
    await prisma.message.updateMany({
      where: { conversationId: conversation.id, type: 'OFFER_REQUEST', metadata: { contains: offerId } },
      data: { type: 'OFFER_REJECTED' }
    });

    const message = await prisma.message.create({
      data: {
        content: `❌ O proprietário recusou a proposta de R$ ${offer.value.toLocaleString('pt-BR')} via ${offer.paymentMethod}.`,
        type: 'TEXT',
        senderId: userId,
        conversationId: conversation.id
      },
      include: { sender: { select: { id: true, name: true, avatar: true } } }
    });

    await prisma.conversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } });

    try {
      const io = getIO();
      io.to(`room_${offer.buyerId}`).emit('receiveMessage', message);
      io.to(`room_${userId}`).emit('receiveMessage', message);
    } catch (e) {}
  }

  return { status: 200, body: updated };
}

export async function approveOffer(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const user = request.user as { id: string };
  try {
    const { status, body } = await approveOfferCore(user.id, id);
    return reply.status(status).send(body);
  } catch (error) {
    console.error('Approve Offer Error:', error);
    return reply.status(500).send({ error: 'Erro ao aprovar proposta.' });
  }
}

export async function rejectOffer(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const user = request.user as { id: string };
  try {
    const { status, body } = await rejectOfferCore(user.id, id);
    return reply.status(status).send(body);
  } catch (error) {
    console.error('Reject Offer Error:', error);
    return reply.status(500).send({ error: 'Erro ao recusar proposta.' });
  }
}
