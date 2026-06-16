import type { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { sendNotification } from '../services/notification.service.js';
import { getIO } from '../socket.js';

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

  // Verifica se o imóvel existe e se é de venda
  const listing = await prisma.listing.findUnique({ where: { id: listingId } });
  if (!listing) return reply.status(404).send({ error: 'Imóvel não encontrado.' });
  if (listing.category !== 'venda') return reply.status(400).send({ error: 'Propostas só estão disponíveis para venda.' });
  if (listing.status === 'SOLD') return reply.status(400).send({ error: 'Este imóvel já foi vendido.' });

  try {
    const offer = await prisma.offer.create({
      data: {
        value,
        paymentMethod,
        buyerId: userId,
        listingId,
      }
    });

    let conversation;

    if (listing.ownerId) {
      await sendNotification({
        userId: listing.ownerId,
        title: 'Nova Proposta de Compra',
        message: `Você recebeu uma proposta de R$ ${value.toLocaleString('pt-BR')} para o imóvel "${listing.name}".`,
        type: 'INFO',
      });

      // Find or create conversation between guest/buyer and host/owner
      conversation = await prisma.conversation.findFirst({
        where: {
          propertyId: listingId,
          participants: {
            every: { id: { in: [userId, listing.ownerId] } }
          }
        }
      });

      if (!conversation) {
        conversation = await prisma.conversation.create({
          data: {
            propertyId: listingId,
            participants: {
              connect: [{ id: userId }, { id: listing.ownerId }]
            }
          }
        });
      }

      // Create Offer Request Message
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

      // Emit socket
      try {
        const io = getIO();
        io.to(`room_${listing.ownerId}`).emit('receiveMessage', message);
        io.to(`room_${userId}`).emit('receiveMessage', message);
      } catch (e) {}

      // Update conversation timestamp
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

export async function approveOffer(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const user = request.user as { id: string };

  try {
    const offer = await prisma.offer.findUnique({
      where: { id },
      include: { listing: true }
    });

    if (!offer) return reply.status(404).send({ error: 'Proposta não encontrada.' });
    if (offer.listing.ownerId !== user.id) return reply.status(403).send({ error: 'Sem permissão.' });

    // Aceita a oferta
    const updated = await prisma.offer.update({
      where: { id },
      data: { status: 'ACCEPTED' }
    });

    // Marca o imóvel como VENDIDO
    await prisma.listing.update({
      where: { id: offer.listingId },
      data: { status: 'SOLD' }
    });

    // Notify buyer
    await sendNotification({
      userId: offer.buyerId,
      title: 'Proposta Aceita! 🎉',
      message: `Sua proposta para o imóvel "${offer.listing.name}" foi aceita pelo proprietário.`,
      type: 'INFO',
    });

    // Find conversation to add message
    const conversation = await prisma.conversation.findFirst({
      where: {
        propertyId: offer.listingId,
        participants: { every: { id: { in: [offer.buyerId, user.id] } } }
      }
    });

    if (conversation) {
      // Update original offer message in this conversation
      await prisma.message.updateMany({
        where: { conversationId: conversation.id, type: 'OFFER_REQUEST', metadata: { contains: id } },
        data: { type: 'OFFER_APPROVED' }
      });

      const message = await prisma.message.create({
        data: {
          content: `✅ O proprietário aceitou sua proposta de R$ ${offer.value.toLocaleString('pt-BR')} via ${offer.paymentMethod}!`,
          type: 'TEXT',
          senderId: user.id,
          conversationId: conversation.id
        },
        include: { sender: { select: { id: true, name: true, avatar: true } } }
      });

      await prisma.conversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } });

      try {
        const io = getIO();
        io.to(`room_${offer.buyerId}`).emit('receiveMessage', message);
        io.to(`room_${user.id}`).emit('receiveMessage', message);
      } catch (e) {}
    }

    return reply.send(updated);
  } catch (error) {
    console.error('Approve Offer Error:', error);
    return reply.status(500).send({ error: 'Erro ao aprovar proposta.' });
  }
}

export async function rejectOffer(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const user = request.user as { id: string };

  try {
    const offer = await prisma.offer.findUnique({
      where: { id },
      include: { listing: true }
    });

    if (!offer) return reply.status(404).send({ error: 'Proposta não encontrada.' });
    if (offer.listing.ownerId !== user.id) return reply.status(403).send({ error: 'Sem permissão.' });

    const updated = await prisma.offer.update({
      where: { id },
      data: { status: 'REJECTED' }
    });

    // Notify buyer
    await sendNotification({
      userId: offer.buyerId,
      title: 'Proposta Recusada',
      message: `Sua proposta para o imóvel "${offer.listing.name}" foi recusada pelo proprietário.`,
      type: 'INFO',
    });

    // Find conversation to add message
    const conversation = await prisma.conversation.findFirst({
      where: {
        propertyId: offer.listingId,
        participants: { every: { id: { in: [offer.buyerId, user.id] } } }
      }
    });

    if (conversation) {
      // Update original offer message in this conversation
      await prisma.message.updateMany({
        where: { conversationId: conversation.id, type: 'OFFER_REQUEST', metadata: { contains: id } },
        data: { type: 'OFFER_REJECTED' }
      });

      const message = await prisma.message.create({
        data: {
          content: `❌ O proprietário recusou a proposta de R$ ${offer.value.toLocaleString('pt-BR')} via ${offer.paymentMethod}.`,
          type: 'TEXT',
          senderId: user.id,
          conversationId: conversation.id
        },
        include: { sender: { select: { id: true, name: true, avatar: true } } }
      });

      await prisma.conversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } });

      try {
        const io = getIO();
        io.to(`room_${offer.buyerId}`).emit('receiveMessage', message);
        io.to(`room_${user.id}`).emit('receiveMessage', message);
      } catch (e) {}
    }

    return reply.send(updated);
  } catch (error) {
    console.error('Reject Offer Error:', error);
    return reply.status(500).send({ error: 'Erro ao recusar proposta.' });
  }
}
