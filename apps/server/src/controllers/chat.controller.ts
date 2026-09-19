import type { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { z } from 'zod';
import { distributeLead } from '../lib/leads.js';

export async function getConversations(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request.user as { id: string }).id;
  const userRole = (request.user as any).role;

  try {
    /**
     * ─── QUERY DE PERMISSÃO / AUDITORIA DE ADMIN (PRISMA OR CLÁUSULA) ─────────────────
     * Uma das maiores complexidades das queries de chat foi gerenciar a privacidade.
     * - Se o usuário for um ADMIN, ele pode listar suas próprias conversas OU qualquer 
     *   conversa que tenha sido explicitamente reportada por um proprietário de imóvel 
     *   (`isReported: true`). Isso permite que a moderação acesse e audite o chat.
     * - Se for um USER normal, ele estritamente só pode listar conversas em que ele é 
     *   um dos participantes (segurança de privacidade do chat).
     */
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
          select: {
            id: true,
            name: true,
            price: true,
            images: { take: 1, orderBy: { order: 'asc' }, select: { url: true } },
          },
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

    const withCoverImage = conversations.map((conversation) => ({
      ...conversation,
      property: {
        id: conversation.property.id,
        name: conversation.property.name,
        price: conversation.property.price,
        image: conversation.property.images[0]?.url ?? null,
      },
    }));

    return reply.send(withCoverImage);
  } catch (error) {
    console.error(error);
    return reply.status(500).send({ message: 'Internal server error' });
  }
}

export async function getMessages(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request.user as { id: string }).id;
  const userRole = (request.user as any).role;
  const { id: conversationId } = request.params as { id: string };

  try {
    // Busca a conversa para verificar as permissões antes de ler as mensagens
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { participants: true }
    });

    /**
     * BYPASS DE SEGURANÇA PARA ADMINS (AUDITORIA):
     * Apenas participantes da conversa podem carregar o histórico de mensagens.
     * No entanto, se o usuário for ADMIN (`userRole === 'ADMIN'`), ele tem permissão de 
     * ler as mensagens para realizar a mediação de denúncias de golpe/má conduta.
     */
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
  const userId = (request.user as { id: string }).id;
  const userRole = (request.user as any).role;
  const { id: conversationId } = request.params as { id: string };

  try {
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        property: {
          select: {
            id: true,
            name: true,
            price: true,
            ownerId: true,
            category: true,
            status: true,
            images: { take: 1, orderBy: { order: 'asc' }, select: { url: true } },
          },
        },
        participants: {
          select: { id: true, name: true, avatar: true }
        }
      }
    });

    // Semelhante ao getMessages, valida permissão de leitura de metadados da conversa
    const isAdmin = userRole === 'ADMIN';
    if (!conversation || (!isAdmin && !conversation.participants.some(p => p.id === userId))) {
      return reply.status(403).send({ message: 'Access denied' });
    }

    return reply.send({
      ...conversation,
      property: {
        id: conversation.property.id,
        name: conversation.property.name,
        price: conversation.property.price,
        ownerId: conversation.property.ownerId,
        category: conversation.property.category,
        status: conversation.property.status,
        image: conversation.property.images[0]?.url ?? null,
      },
    });
  } catch (error) {
    console.error(error);
    return reply.status(500).send({ message: 'Internal server error' });
  }
}

export async function createOrGetConversation(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request.user as { id: string }).id;
  
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

    // Imóvel de pessoa física: contato é o dono (ownerId). Imóvel de organização (CRM B2B, ver
    // docs/crm-b2b-organizacoes-leads.md): contato é o agentId (mesmo campo que já rege permissão
    // de editar/duplicar o imóvel) — reatribuir o Lead depois não troca quem já está na conversa,
    // simplificação deliberada registrada no doc.
    const contactId = listing.ownerId ?? listing.agentId;

    if (!contactId) {
      return reply.status(400).send({ message: 'Listing has no owner to contact' });
    }

    if (contactId === userId) {
      return reply.status(400).send({ message: 'Cannot start conversation with yourself' });
    }

    // Check if conversation already exists between these 2 users for this property
    const existingConversation = await prisma.conversation.findFirst({
      where: {
        propertyId: listingId,
        participants: {
          every: {
            id: { in: [userId, contactId] }
          }
        }
      }
    });

    if (existingConversation) {
      return reply.status(200).send(existingConversation);
    }

    if (listing.status === 'SOLD') {
      return reply.status(400).send({ message: 'Este imóvel já foi vendido e não aceita novas negociações.' });
    }

    // Create new
    const newConversation = await prisma.conversation.create({
      data: {
        propertyId: listingId,
        participants: {
          connect: [{ id: userId }, { id: contactId }]
        }
      }
    });

    // Gatilho do Lead (CRM B2B, Fase 2): só para imóveis de organização, só na 1ª conversa —
    // aditivo, nunca derruba a criação da conversa se falhar.
    if (listing.organizationId) {
      try {
        const organization = await prisma.organization.findUnique({ where: { id: listing.organizationId } });
        if (organization) {
          const lead = await prisma.lead.create({
            data: {
              userId,
              listingId,
              organizationId: listing.organizationId,
              status: 'NEW',
              source: 'CHAT',
            },
          });
          await distributeLead(lead, organization);
        }
      } catch (leadError) {
        console.error('Falha ao criar/distribuir Lead para a conversa:', leadError);
      }
    }

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
  const userId = (request.user as { id: string }).id;
  const { id: conversationId } = request.params as { id: string };

  try {
    // Verifica se o usuário é participante da conversa antes de marcar mensagens como lidas (fix IDOR)
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { participants: { select: { id: true } } },
    });

    if (!conversation || !conversation.participants.some(p => p.id === userId)) {
      return reply.status(403).send({ message: 'Access denied' });
    }

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
  const userId = (request.user as { id: string }).id;
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
