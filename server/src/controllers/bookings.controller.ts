import type { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { sendNotification } from '../services/notification.service.js';
import { getIO } from '../socket.js';

export async function createBooking(request: FastifyRequest, reply: FastifyReply) {
  const { id: userId } = request.user as { id: string };
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

  // Verifica se o imóvel existe e se é de aluguel
  const listing = await prisma.listing.findUnique({ where: { id: listingId } });
  if (!listing) return reply.status(404).send({ error: 'Imóvel não encontrado.' });
  if (listing.category !== 'aluguel') return reply.status(400).send({ error: 'Reservas só estão disponíveis para aluguel.' });

  // Verificar se as datas se sobrepõem com reservas existentes (CONFIRMED)
  const overlappingBookings = await prisma.booking.findMany({
    where: {
      listingId,
      status: 'CONFIRMED',
      OR: [
        {
          startDate: { lte: endDate },
          endDate: { gte: startDate }
        }
      ]
    }
  });

  if (overlappingBookings.length > 0) {
    return reply.status(400).send({ error: 'O imóvel já está reservado neste período.' });
  }

  try {
    const booking = await prisma.booking.create({
      data: {
        startDate,
        endDate,
        userId,
        listingId,
      }
    });

    let conversation;

    // Send notification to the property owner if it has one
    if (listing.ownerId) {
      await sendNotification({
        userId: listing.ownerId,
        title: 'Nova Solicitação de Reserva',
        message: `Uma nova solicitação para "${listing.name}" de ${new Date(startDate).toLocaleDateString()} a ${new Date(endDate).toLocaleDateString()}.`,
        type: 'BOOKING',
      });

      // Find or create conversation between guest and host
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

      // Create Booking Request Message
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

      // Emit socket
      try {
        const io = getIO();
        io.to(`room_${listing.ownerId}`).emit('receiveMessage', message);
        io.to(`room_${userId}`).emit('receiveMessage', message); // also to self, though maybe not needed if it's sent locally, but it's fine
      } catch(e) {}

      // Update conversation timestamp
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { updatedAt: new Date() }
      });
    }

    return reply.status(201).send({ booking, conversationId: conversation?.id });
  } catch (error) {
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

export async function approveBooking(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const user = request.user as { id: string };

  try {
    const booking = await prisma.booking.findUnique({
      where: { id },
      include: { listing: true }
    });

    if (!booking) return reply.status(404).send({ error: 'Reserva não encontrada.' });
    if (booking.listing.ownerId !== user.id) return reply.status(403).send({ error: 'Sem permissão.' });

    const updated = await prisma.booking.update({
      where: { id },
      data: { status: 'CONFIRMED' }
    });

    // Notify guest
    await sendNotification({
      userId: booking.userId,
      title: 'Reserva Aprovada! 🎉',
      message: `Sua reserva para "${booking.listing.name}" foi aprovada pelo anfitrião.`,
      type: 'BOOKING',
    });

    // Find conversation to add message
    const conversation = await prisma.conversation.findFirst({
      where: {
        propertyId: booking.listingId,
        participants: { every: { id: { in: [booking.userId, user.id] } } }
      }
    });

    if (conversation) {
      // Update original request message
      await prisma.message.updateMany({
        where: { conversationId: conversation.id, type: 'BOOKING_REQUEST', metadata: { contains: id } },
        data: { type: 'BOOKING_APPROVED' }
      });

      const message = await prisma.message.create({
        data: {
          content: `✅ O anfitrião aprovou sua solicitação de reserva para o período de ${new Date(booking.startDate).toLocaleDateString()} a ${new Date(booking.endDate).toLocaleDateString()}.`,
          type: 'TEXT',
          senderId: user.id,
          conversationId: conversation.id
        },
        include: { sender: { select: { id: true, name: true, avatar: true } } }
      });
      await prisma.conversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } });

      try {
        const io = getIO();
        io.to(`room_${booking.userId}`).emit('receiveMessage', message);
        io.to(`room_${user.id}`).emit('receiveMessage', message);
      } catch(e) {}
    }

    return reply.send(updated);
  } catch (error) {
    return reply.status(500).send({ error: 'Erro ao aprovar reserva.' });
  }
}

export async function rejectBooking(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const user = request.user as { id: string };

  try {
    const booking = await prisma.booking.findUnique({
      where: { id },
      include: { listing: true }
    });

    if (!booking) return reply.status(404).send({ error: 'Reserva não encontrada.' });
    if (booking.listing.ownerId !== user.id) return reply.status(403).send({ error: 'Sem permissão.' });

    const updated = await prisma.booking.update({
      where: { id },
      data: { status: 'REJECTED' }
    });

    // Notify guest
    await sendNotification({
      userId: booking.userId,
      title: 'Reserva Recusada',
      message: `Sua reserva para "${booking.listing.name}" foi recusada pelo anfitrião.`,
      type: 'SYSTEM',
    });

    // Find conversation to add message
    const conversation = await prisma.conversation.findFirst({
      where: {
        propertyId: booking.listingId,
        participants: { every: { id: { in: [booking.userId, user.id] } } }
      }
    });

    if (conversation) {
      // Update original request message
      await prisma.message.updateMany({
        where: { conversationId: conversation.id, type: 'BOOKING_REQUEST', metadata: { contains: id } },
        data: { type: 'BOOKING_REJECTED' }
      });

      const message = await prisma.message.create({
        data: {
          content: `❌ O anfitrião recusou a solicitação de reserva.`,
          type: 'TEXT',
          senderId: user.id,
          conversationId: conversation.id
        },
        include: { sender: { select: { id: true, name: true, avatar: true } } }
      });
      await prisma.conversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } });

      try {
        const io = getIO();
        io.to(`room_${booking.userId}`).emit('receiveMessage', message);
        io.to(`room_${user.id}`).emit('receiveMessage', message);
      } catch(e) {}
    }

    return reply.send(updated);
  } catch (error) {
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
    if (booking.userId !== user.id && booking.listing.ownerId !== user.id) {
      return reply.status(403).send({ error: 'Sem permissão.' });
    }

    if (booking.status === 'CANCELLED' || booking.status === 'REJECTED') {
      return reply.status(400).send({ error: 'Reserva já está cancelada ou recusada.' });
    }

    const updated = await prisma.booking.update({
      where: { id },
      data: { status: 'CANCELLED' }
    });

    const targetUserId = booking.userId === user.id ? booking.listing.ownerId : booking.userId;
    const isGuest = booking.userId === user.id;

    if (targetUserId) {
      await sendNotification({
        userId: targetUserId,
        title: 'Reserva Cancelada',
        message: isGuest 
          ? `O hóspede cancelou a reserva para "${booking.listing.name}".`
          : `O anfitrião cancelou sua reserva para "${booking.listing.name}".`,
        type: 'SYSTEM',
      });
    }

    if (booking.listing.ownerId) {
      const conversation = await prisma.conversation.findFirst({
        where: {
          propertyId: booking.listingId,
          participants: { every: { id: { in: [booking.userId, booking.listing.ownerId] } } }
        }
      });

      if (conversation) {
        const message = await prisma.message.create({
          data: {
            content: `🚫 ${isGuest ? 'O hóspede' : 'O anfitrião'} cancelou a reserva.`,
            type: 'TEXT',
            senderId: user.id,
            conversationId: conversation.id
          },
          include: { sender: { select: { id: true, name: true, avatar: true } } }
        });
        await prisma.conversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } });

        try {
          const io = getIO();
          io.to(`room_${booking.userId}`).emit('receiveMessage', message);
          io.to(`room_${booking.listing.ownerId}`).emit('receiveMessage', message);
        } catch(e) {}
      }
    }

    return reply.send(updated);
  } catch (error) {
    return reply.status(500).send({ error: 'Erro ao cancelar reserva.' });
  }
}
