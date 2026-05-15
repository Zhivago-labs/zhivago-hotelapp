import type { FastifyRequest, FastifyReply } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const prisma = new PrismaClient();

export async function getConversations(request: FastifyRequest, reply: FastifyReply) {
  const userId = request.user.id;
  const userRole = (request.user as any).role;

  try {
    const whereClause: any = userRole === 'ADMIN' 
      ? {
          OR: [
            { participants: { some: { id: userId } } },
            { isReported: true }
          ]
        }
      : {
          participants: {
            some: { id: userId }
          }
        };

    const conversations = await prisma.conversation.findMany({
      where: whereClause,
      include: {
        property: {
          select: { id: true, name: true, price: true, image: true }
        },
        participants: {
          select: { id: true, name: true, avatar: true }
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1
        },
        _count: {
          select: {
            messages: {
              where: {
                isRead: false,
                senderId: { not: userId }
              }
            }
          }
        }
      },
      orderBy: { updatedAt: 'desc' }
    });

    return reply.send(conversations);
  } catch (error) {
    console.error(error);
    return reply.status(500).send({ message: 'Internal server error' });
  }
}

export async function getMessages(request: FastifyRequest, reply: FastifyReply) {
  const userId = request.user.id;
  const userRole = (request.user as any).role;
  const { id: conversationId } = request.params as { id: string };

  try {
    // Validate participation
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { participants: true }
    });

    const isAdmin = userRole === 'ADMIN';
    if (!conversation || (!isAdmin && !conversation.participants.some(p => p.id === userId))) {
      return reply.status(403).send({ message: 'Access denied' });
    }

    const messages = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      include: {
        sender: {
          select: { id: true, name: true, avatar: true }
        }
      }
    });

    return reply.send(messages);
  } catch (error) {
    console.error(error);
    return reply.status(500).send({ message: 'Internal server error' });
  }
}

export async function getConversation(request: FastifyRequest, reply: FastifyReply) {
  const userId = request.user.id;
  const userRole = (request.user as any).role;
  const { id: conversationId } = request.params as { id: string };

  try {
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        property: {
          select: { id: true, name: true, price: true, image: true, ownerId: true }
        },
        participants: {
          select: { id: true, name: true, avatar: true }
        }
      }
    });

    const isAdmin = userRole === 'ADMIN';
    if (!conversation || (!isAdmin && !conversation.participants.some(p => p.id === userId))) {
      return reply.status(403).send({ message: 'Access denied' });
    }

    return reply.send(conversation);
  } catch (error) {
    console.error(error);
    return reply.status(500).send({ message: 'Internal server error' });
  }
}

export async function createOrGetConversation(request: FastifyRequest, reply: FastifyReply) {
  const userId = request.user.id;
  
  const createSchema = z.object({
    listingId: z.string().uuid()
  });

  try {
    const { listingId } = createSchema.parse(request.body);

    const listing = await prisma.listing.findUnique({
      where: { id: listingId }
    });

    if (!listing) {
      return reply.status(404).send({ message: 'Listing not found' });
    }

    if (!listing.ownerId) {
      return reply.status(400).send({ message: 'Listing has no owner to contact' });
    }

    if (listing.ownerId === userId) {
      return reply.status(400).send({ message: 'Cannot start conversation with yourself' });
    }

    // Check if conversation already exists between these 2 users for this property
    const existingConversation = await prisma.conversation.findFirst({
      where: {
        propertyId: listingId,
        participants: {
          every: {
            id: { in: [userId, listing.ownerId] }
          }
        }
      }
    });

    if (existingConversation) {
      return reply.status(200).send(existingConversation);
    }

    // Create new
    const newConversation = await prisma.conversation.create({
      data: {
        propertyId: listingId,
        participants: {
          connect: [{ id: userId }, { id: listing.ownerId }]
        }
      }
    });

    return reply.status(201).send(newConversation);
  } catch (error) {
    console.error(error);
    if (error instanceof z.ZodError) {
      return reply.status(400).send({ message: 'Invalid data', errors: error.errors });
    }
    return reply.status(500).send({ message: 'Internal server error' });
  }
}

export async function markAsRead(request: FastifyRequest, reply: FastifyReply) {
  const userId = request.user.id;
  const { id: conversationId } = request.params as { id: string };

  try {
    await prisma.message.updateMany({
      where: {
        conversationId,
        senderId: { not: userId },
        isRead: false
      },
      data: { isRead: true }
    });

    return reply.send({ success: true });
  } catch (error) {
    console.error(error);
    return reply.status(500).send({ message: 'Internal server error' });
  }
}

export async function reportConversation(request: FastifyRequest, reply: FastifyReply) {
  const userId = request.user.id;
  const { id: conversationId } = request.params as { id: string };

  try {
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { participants: true, property: true }
    });

    if (!conversation) {
      return reply.status(404).send({ message: 'Conversation not found' });
    }

    if (conversation.property.ownerId !== userId) {
      return reply.status(403).send({ message: 'Only the property owner can report this conversation' });
    }

    const updated = await prisma.conversation.update({
      where: { id: conversationId },
      data: { isReported: true }
    });

    return reply.send(updated);
  } catch (error) {
    console.error(error);
    return reply.status(500).send({ message: 'Internal server error' });
  }
}

export async function closeConversation(request: FastifyRequest, reply: FastifyReply) {
  const userRole = (request.user as any).role;
  const { id: conversationId } = request.params as { id: string };

  if (userRole !== 'ADMIN') {
    return reply.status(403).send({ message: 'Admin access required' });
  }

  try {
    const updated = await prisma.conversation.update({
      where: { id: conversationId },
      data: { isClosed: true }
    });

    return reply.send(updated);
  } catch (error) {
    console.error(error);
    return reply.status(500).send({ message: 'Internal server error' });
  }
}

export async function reopenConversation(request: FastifyRequest, reply: FastifyReply) {
  const userRole = (request.user as any).role;
  const { id: conversationId } = request.params as { id: string };

  if (userRole !== 'ADMIN') {
    return reply.status(403).send({ message: 'Admin access required' });
  }

  try {
    const updated = await prisma.conversation.update({
      where: { id: conversationId },
      data: { isClosed: false }
    });

    return reply.send(updated);
  } catch (error) {
    console.error(error);
    return reply.status(500).send({ message: 'Internal server error' });
  }
}
