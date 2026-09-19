import type { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { z } from 'zod';
import { distributeLead, canManageListingConversation } from '../lib/leads.js';
import { CHAT_COMMANDS } from '../socket.js';

const LEAD_STATUSES_WITHOUT_NEGOTIATE_COMMAND = new Set(['NEGOTIATION', 'WON', 'LOST']);
const COMMAND_BY_TRIGGER = Object.fromEntries(CHAT_COMMANDS.map((c) => [c.trigger, c]));

/**
 * Quais comandos de `/` fazem sentido oferecer agora nesta conversa — usado pelo menu de
 * autocomplete do front (digitar "/" no chat). Mesma fonte de verdade que `socket.ts` realmente
 * executa (`CHAT_COMMANDS`), só decide QUAIS mostrar: nada se o viewer não pode agir
 * (`canManage`); aprovar/recusar só com uma solicitação ainda pendente; negociar só em imóvel de
 * organização com Lead que ainda não chegou no fim do funil.
 */
async function computeAvailableCommands(
  canManage: boolean,
  conversation: { id: string; property: { id: string; organizationId: string | null }; participants: { id: string }[] }
): Promise<(typeof CHAT_COMMANDS)[number][]> {
  if (!canManage) return [];

  const commands: (typeof CHAT_COMMANDS)[number][] = [];

  const pendingRequest = await prisma.message.findFirst({
    where: { conversationId: conversation.id, type: { in: ['BOOKING_REQUEST', 'OFFER_REQUEST'] } },
    orderBy: { createdAt: 'desc' },
  });
  if (pendingRequest) {
    commands.push(COMMAND_BY_TRIGGER['/aprovar']!, COMMAND_BY_TRIGGER['/recusar']!);
  }

  if (conversation.property.organizationId) {
    const lead = await prisma.lead.findFirst({
      where: {
        listingId: conversation.property.id,
        organizationId: conversation.property.organizationId,
        userId: { in: conversation.participants.map((p) => p.id) },
      },
      select: { status: true },
    });
    if (lead && !LEAD_STATUSES_WITHOUT_NEGOTIATE_COMMAND.has(lead.status)) {
      commands.push(COMMAND_BY_TRIGGER['/negociar']!);
    }
  }

  return commands;
}

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
            organizationId: true,
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

    // Quem pode aprovar/recusar reserva ou proposta nesta conversa (ver canManageListingConversation
    // em lib/leads.ts) — o front não consegue derivar isso sozinho a partir de `ownerId` porque
    // imóvel de organização nunca tem `ownerId` preenchido, e quem responde muda conforme o Lead é
    // (re)atribuído no CRM.
    const canManage = await canManageListingConversation(
      userId,
      conversation.property,
      conversation.participants.map((p) => p.id)
    );

    // Comandos de "/" que fazem sentido oferecer agora (ver computeAvailableCommands) — o menu de
    // autocomplete do front usa isso pra saber o que listar, sem duplicar a regra de quando cada
    // comando se aplica.
    const availableCommands = await computeAvailableCommands(canManage, conversation);

    return reply.send({
      ...conversation,
      canManage,
      availableCommands,
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

    // Já existe uma conversa deste cliente pra este imóvel? Busca só pelo cliente (`userId`), não
    // pelo par [userId, contactId] — em imóvel de organização o 2º participante muda ao longo do
    // tempo conforme o Lead é (re)atribuído no CRM (ver `assignLead`/`syncConversationParticipant`
    // em lib/leads.ts), então travar a busca no `contactId` de hoje deixaria de achar a conversa já
    // aberta assim que o corretor responsável mudasse — e recriaria conversa (e Lead) duplicados.
    const existingConversation = await prisma.conversation.findFirst({
      where: {
        propertyId: listingId,
        participants: { some: { id: userId } }
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
