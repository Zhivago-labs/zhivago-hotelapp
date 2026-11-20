import type { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { workspaceMembership, workspaceConversationScope } from '../lib/workspace.js';
import { z } from 'zod';
import { ensureLead, getCurrentAssignment, canManageListingConversation } from '../lib/leads.js';
import { CHAT_COMMANDS, findActionablePending, findPendingRound, getIO } from '../socket.js';
import { sendNotification } from '../services/notification.service.js';
import { CHAT_BLOCKED_MESSAGE, canRemoveChatBlock, chatBlocksBetween, isChatBlocked } from '../lib/chat-blocks.js';

const LEAD_STATUSES_WITHOUT_NEGOTIATE_COMMAND = new Set(['NEGOTIATION', 'WON', 'LOST']);
const COMMAND_BY_TRIGGER = Object.fromEntries(CHAT_COMMANDS.map((c) => [c.trigger, c]));

/**
 * Quais comandos de `/` fazem sentido oferecer agora nesta conversa — usado pelo menu de
 * autocomplete do front (digitar "/" no chat). Mesma fonte de verdade que `socket.ts` realmente
 * executa (`CHAT_COMMANDS`), só decide QUAIS mostrar:
 * - aprovar/recusar: só com uma solicitação que o viewer ainda pode responder (findActionablePending);
 * - venda (só venda): sem rodada pendente, o anunciante oferece o imóvel; o comprador ganha
 *   `comprar` (pelo valor anunciado) — os dois mesmo quando o anúncio não aceita negociação;
 * - proposta: anúncio aceita negociação e não há rodada pendente (na venda, só pro comprador —
 *   o anunciante usa `venda`);
 * - contraproposta: há rodada pendente vinda do OUTRO lado e o anúncio aceita negociação (ou o
 *   viewer é o anunciante);
 * - retirar: há rodada pendente vinda do lado do viewer;
 * - negociar (mover o lead): lado do anúncio, enquanto o Lead não chegou no fim do funil.
 */
async function computeAvailableCommands(
  viewerId: string,
  canManage: boolean,
  isParticipant: boolean,
  conversation: { id: string; leadId: string | null; isClosed: boolean },
  property: { acceptsNegotiation: boolean; status: string; operationType: string }
): Promise<(typeof CHAT_COMMANDS)[number][]> {
  if (!isParticipant || conversation.isClosed) return [];

  const commands: (typeof CHAT_COMMANDS)[number][] = [];

  if (await findActionablePending(conversation.id, viewerId, canManage)) {
    commands.push(COMMAND_BY_TRIGGER['/aprovar']!, COMMAND_BY_TRIGGER['/recusar']!);
  }

  const isSale = property.operationType === 'SALE';
  if (property.status === 'APPROVED' && (property.acceptsNegotiation || isSale)) {
    const pending = await findPendingRound(conversation.id, viewerId);
    if (!pending) {
      if (isSale) commands.push(COMMAND_BY_TRIGGER[canManage ? '/venda' : '/comprar']!);
      if (property.acceptsNegotiation && !(isSale && canManage)) commands.push(COMMAND_BY_TRIGGER['/proposta']!);
    } else if (pending.from === 'theirs') {
      if (property.acceptsNegotiation || canManage) commands.push(COMMAND_BY_TRIGGER['/contraproposta']!);
    } else {
      commands.push(COMMAND_BY_TRIGGER['/retirar']!);
    }
  }

  // Fonte de verdade única (seção 27 da spec): o Lead da conversa é `conversation.leadId`, não
  // mais um heurístico por listingId+participantes.
  if (canManage && conversation.leadId) {
    const lead = await prisma.lead.findUnique({ where: { id: conversation.leadId }, select: { status: true } });
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

    const member = await workspaceMembership(request);
    const corporateIds = new Set(member ? (await prisma.conversation.findMany({
      where: workspaceConversationScope(member), select: { id: true },
    })).map(c => c.id) : []);
    const conversations = await prisma.conversation.findMany({
      where: whereClause,
      include: {
        lead: { select: { userId: true } },
        property: {
          select: {
            id: true,
            name: true,
            price: true,
            organizationId: true,
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

    const withCoverImage = conversations.map(({ lead, ...conversation }) => ({
      ...conversation,
      inboxScope: corporateIds.has(conversation.id) ? 'organization'
        : conversation.participants.some(p => p.id === userId) && (!conversation.property.organizationId || lead?.userId === userId)
          ? 'personal' : 'other',
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
            operationType: true,
            acceptsNegotiation: true,
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
    const availableCommands = await computeAvailableCommands(
      userId,
      canManage,
      conversation.participants.some((p) => p.id === userId),
      conversation,
      conversation.property
    );

    // Encerrar é exclusivo de imóvel de imobiliária (ou da administração); reabrir segue as regras
    // de `reopenConversation`. Bloqueio: se há algum ativo e qual deles o viewer pode desfazer.
    const participantIds = conversation.participants.map((p) => p.id);
    const isParticipant = participantIds.includes(userId);
    const blocks = await chatBlocksBetween(participantIds, conversation.property.organizationId);
    let removableBlockId: string | null = null;
    for (const b of blocks) {
      if (await canRemoveChatBlock(userId, b)) { removableBlockId = b.id; break; }
    }
    const isBlocked = blocks.length > 0;
    const canClose = !conversation.isClosed && (isAdmin || (!!conversation.property.organizationId && canManage));
    const canReopen = conversation.isClosed && !isBlocked &&
      (isAdmin || (conversation.closedBy !== 'ADMIN' && (isParticipant || canManage)));

    return reply.send({
      ...conversation,
      canManage,
      canClose,
      canReopen,
      canBlock: isParticipant && !isAdmin && !isBlocked,
      block: { active: isBlocked, removableId: removableBlockId },
      availableCommands,
      property: {
        id: conversation.property.id,
        name: conversation.property.name,
        price: conversation.property.price,
        ownerId: conversation.property.ownerId,
        category: conversation.property.category,
        operationType: conversation.property.operationType,
        acceptsNegotiation: conversation.property.acceptsNegotiation,
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

    if (listing.ownerId === userId || listing.agentId === userId) {
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

    // Bloqueio (ver lib/chat-blocks.ts): com o dono/corretor do imóvel ou com a imobiliária dele.
    const contactIds = [userId, listing.ownerId, listing.agentId].filter((id): id is string => !!id);
    if (await isChatBlocked(contactIds, listing.organizationId)) {
      return reply.status(403).send({ message: 'Não é possível iniciar uma conversa com este anunciante.' });
    }

    if (listing.status === 'SOLD' || listing.status === 'RENTED') {
      const closedAs = listing.status === 'SOLD' ? 'vendido' : 'alugado';
      return reply.status(400).send({ message: `Este imóvel já foi ${closedAs} e não aceita novas negociações.` });
    }

    // Imóvel de organização: autoridade é o Lead + responsável atual (seção 24/108 da spec) — não
    // mais `ownerId ?? agentId`. Lead nasce ANTES da conversa (`ensureLead`, transacionalmente
    // consistente por si só) e a conversa referencia `leadId` desde a criação; o 2º participante é
    // quem estiver atualmente atribuído, se já houver alguém (pode nascer sem ninguém, e
    // `assignLead`/`syncConversationParticipant` adicionam o corretor depois, quando atribuído).
    if (listing.organizationId) {
      const organization = await prisma.organization.findUnique({ where: { id: listing.organizationId } });
      if (!organization) {
        return reply.status(400).send({ message: 'Listing has no owner to contact' });
      }

      const lead = await ensureLead({
        userId,
        listingId,
        organizationId: listing.organizationId,
        source: 'CHAT',
      });

      const currentAssignment = await getCurrentAssignment(lead.id);
      const participantIds = [userId];
      if (currentAssignment) {
        const broker = await prisma.organizationMember.findUnique({ where: { id: currentAssignment.brokerId } });
        if (broker && broker.userId !== userId) participantIds.push(broker.userId);
      }

      const newConversation = await prisma.conversation.create({
        data: {
          propertyId: listingId,
          leadId: lead.id,
          participants: { connect: participantIds.map((id) => ({ id })) },
        },
      });

      return reply.status(201).send(newConversation);
    }

    // Pessoa física: sem CRM/Lead — contato continua sendo o dono do imóvel.
    const contactId = listing.ownerId;
    if (!contactId) {
      return reply.status(400).send({ message: 'Listing has no owner to contact' });
    }

    const newConversation = await prisma.conversation.create({
      data: {
        propertyId: listingId,
        participants: {
          connect: [{ id: userId }, { id: contactId }]
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

    const parsed = z.object({ messageIds: z.array(z.string().min(1)).max(100).optional() }).safeParse(request.body ?? {});
    if (!parsed.success) return reply.status(400).send({ message: 'Invalid read receipt' });

    // Snapshot the exact messages before updating: a message arriving during this
    // request must not be included in the receipt for an earlier view.
    const unread = await prisma.message.findMany({
      where: {
        conversationId,
        senderId: { not: userId },
        isRead: false,
        ...(parsed.data.messageIds ? { id: { in: parsed.data.messageIds } } : {}),
      },
      select: { id: true },
    });
    const messageIds = unread.map((message) => message.id);
    if (messageIds.length > 0) {
      await prisma.message.updateMany({
        where: { conversationId, id: { in: messageIds }, senderId: { not: userId } },
        data: { isRead: true },
      });
      const io = getIO();
      for (const participant of conversation.participants) {
        io.to(`room_${participant.id}`).emit('messagesRead', { conversationId, readerId: userId, messageIds });
      }
    }

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

// ─── ENCERRAR / REABRIR ──────────────────────────────────────────────────────

const conversationForActions = {
  participants: { select: { id: true, name: true } },
  property: { select: { id: true, name: true, ownerId: true, organizationId: true, organization: { select: { name: true } } } },
} as const;

type ConversationForActions = NonNullable<Awaited<ReturnType<typeof loadConversationForActions>>>;

function loadConversationForActions(id: string) {
  return prisma.conversation.findUnique({ where: { id }, include: conversationForActions });
}

function emitConversationUpdated(participantIds: string[], conversationId: string) {
  try {
    const io = getIO();
    for (const id of new Set(participantIds)) io.to(`room_${id}`).emit('conversationUpdated', { conversationId });
  } catch {
    // socket não inicializado (scripts/testes) — o estado já está no banco
  }
}

/** Posta a mensagem automática de encerramento/reabertura e avisa todas as telas da conversa. */
async function postConversationEvent(
  conversation: ConversationForActions,
  actorId: string,
  type: 'CONVERSATION_CLOSED' | 'CONVERSATION_REOPENED',
  content: string
) {
  const message = await prisma.message.create({
    data: { content, type, senderId: actorId, conversationId: conversation.id },
    include: { sender: { select: { id: true, name: true, avatar: true } } },
  });
  await prisma.conversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } });
  const roomIds = [...new Set([...conversation.participants.map((p) => p.id), actorId])];
  try {
    const io = getIO();
    for (const id of roomIds) io.to(`room_${id}`).emit('receiveMessage', message);
  } catch {
    // socket não inicializado
  }
  emitConversationUpdated(roomIds, conversation.id);
  return message;
}

/**
 * Encerra o atendimento. Administração da plataforma encerra qualquer conversa (moderação, só ela
 * reabre); fora isso, exclusivo de imóvel de imobiliária: quem atende o Lead pelo lado do anúncio
 * (`canManageListingConversation`). O cliente recebe uma mensagem automática e deixa de poder
 * escrever, mas pode reabrir pelo próprio chat (`reopenConversation`).
 */
export async function closeConversation(request: FastifyRequest, reply: FastifyReply) {
  const { id: userId, role } = request.user as { id: string; role: string };
  const { id: conversationId } = request.params as { id: string };

  const conversation = await loadConversationForActions(conversationId);
  if (!conversation) return reply.status(404).send({ message: 'Conversa não encontrada.' });

  const isAdmin = role === 'ADMIN';
  const participantIds = conversation.participants.map((p) => p.id);
  if (!isAdmin) {
    if (!conversation.property.organizationId) {
      return reply.status(403).send({ message: 'Encerrar conversas é exclusivo de imobiliárias.' });
    }
    if (!(await canManageListingConversation(userId, conversation.property, participantIds))) {
      return reply.status(403).send({ message: 'Sem permissão para encerrar esta conversa.' });
    }
  }
  if (conversation.isClosed) return reply.status(409).send({ message: 'Esta conversa já está encerrada.' });

  const updated = await prisma.conversation.update({
    where: { id: conversationId },
    data: { isClosed: true, closedBy: isAdmin ? 'ADMIN' : 'LISTING', closedAt: new Date() },
  });

  const agencyName = conversation.property.organization?.name ?? 'a imobiliária';
  const text = isAdmin
    ? 'Esta conversa foi encerrada pela administração do Zhivago.'
    : `Esta conversa foi encerrada por ${agencyName}. Se precisar de algo mais, você pode reabri-la por aqui.`;
  await postConversationEvent(conversation, userId, 'CONVERSATION_CLOSED', text);

  for (const id of participantIds.filter((id) => id !== userId)) {
    await sendNotification({ userId: id, title: 'Conversa encerrada', message: `${conversation.property.name}: ${text}`, type: 'MESSAGE' });
  }

  return reply.send(updated);
}

/**
 * Reabre. Encerrada pela administração: só ela reabre. Encerrada pela imobiliária: tanto quem
 * atende pelo anúncio quanto o próprio cliente (pelo modal do chat) — o outro lado é avisado.
 * Conversa com bloqueio ativo não reabre (nada poderia ser enviado mesmo).
 */
export async function reopenConversation(request: FastifyRequest, reply: FastifyReply) {
  const { id: userId, role } = request.user as { id: string; role: string };
  const { id: conversationId } = request.params as { id: string };

  const conversation = await loadConversationForActions(conversationId);
  if (!conversation) return reply.status(404).send({ message: 'Conversa não encontrada.' });
  if (!conversation.isClosed) return reply.status(409).send({ message: 'Esta conversa já está aberta.' });

  const isAdmin = role === 'ADMIN';
  const participantIds = conversation.participants.map((p) => p.id);
  if (!isAdmin) {
    if (conversation.closedBy === 'ADMIN') {
      return reply.status(403).send({ message: 'Esta conversa foi encerrada pela administração e só ela pode reabrir.' });
    }
    const isParticipant = participantIds.includes(userId);
    if (!isParticipant && !(await canManageListingConversation(userId, conversation.property, participantIds))) {
      return reply.status(403).send({ message: 'Sem permissão para reabrir esta conversa.' });
    }
    if (await isChatBlocked(participantIds, conversation.property.organizationId)) {
      return reply.status(403).send({ message: CHAT_BLOCKED_MESSAGE });
    }
  }

  const updated = await prisma.conversation.update({
    where: { id: conversationId },
    data: { isClosed: false, closedBy: null, closedAt: null },
  });

  const actorName = conversation.participants.find((p) => p.id === userId)?.name;
  const text = isAdmin
    ? 'Esta conversa foi reaberta pela administração do Zhivago.'
    : `${actorName ?? 'Alguém da equipe'} reabriu a conversa.`;
  await postConversationEvent(conversation, userId, 'CONVERSATION_REOPENED', text);

  for (const id of participantIds.filter((id) => id !== userId)) {
    await sendNotification({ userId: id, title: 'Conversa reaberta', message: `${conversation.property.name}: ${text}`, type: 'MESSAGE' });
  }

  return reply.send(updated);
}

// ─── BLOQUEAR ────────────────────────────────────────────────────────────────

/**
 * Bloqueia "o outro lado" desta conversa (ver model `ChatBlock`):
 * - quem atende pela imobiliária bloqueia o cliente em nome da imobiliária toda;
 * - o cliente de um imóvel de imobiliária bloqueia a imobiliária inteira;
 * - imóvel de pessoa física: bloqueio pessoal entre cliente e dono.
 */
export async function blockConversation(request: FastifyRequest, reply: FastifyReply) {
  const { id: userId } = request.user as { id: string };
  const { id: conversationId } = request.params as { id: string };

  const conversation = await loadConversationForActions(conversationId);
  if (!conversation || !conversation.participants.some((p) => p.id === userId)) {
    return reply.status(404).send({ message: 'Conversa não encontrada.' });
  }
  const participantIds = conversation.participants.map((p) => p.id);
  const organizationId = conversation.property.organizationId;

  let data: { blockerId: string; blockerOrganizationId?: string; blockedUserId?: string; blockedOrganizationId?: string };
  if (organizationId) {
    const member = await prisma.organizationMember.findUnique({ where: { userId } });
    const isTeam = !!member && member.status === 'ACTIVE' && member.organizationId === organizationId;
    if (isTeam) {
      const team = await prisma.organizationMember.findMany({
        where: { organizationId, userId: { in: participantIds } },
        select: { userId: true },
      });
      const teamIds = new Set(team.map((m) => m.userId));
      const customerId = participantIds.find((id) => !teamIds.has(id));
      if (!customerId) return reply.status(400).send({ message: 'Não há cliente para bloquear nesta conversa.' });
      data = { blockerId: userId, blockerOrganizationId: organizationId, blockedUserId: customerId };
    } else {
      data = { blockerId: userId, blockedOrganizationId: organizationId };
    }
  } else {
    const otherId = conversation.property.ownerId === userId
      ? participantIds.find((id) => id !== userId)
      : conversation.property.ownerId;
    if (!otherId || otherId === userId) return reply.status(400).send({ message: 'Não há ninguém para bloquear nesta conversa.' });
    data = { blockerId: userId, blockedUserId: otherId };
  }

  if (data.blockedUserId) {
    const target = await prisma.user.findUnique({ where: { id: data.blockedUserId }, select: { role: true } });
    if (target?.role === 'ADMIN') return reply.status(400).send({ message: 'Não é possível bloquear a administração.' });
  }

  // Mesmo par já bloqueado pelo mesmo lado: não duplica (em nome da imobiliária, vale o de qualquer membro).
  const existing = await prisma.chatBlock.findFirst({
    where: {
      ...(data.blockerOrganizationId ? { blockerOrganizationId: data.blockerOrganizationId } : { blockerId: userId, blockerOrganizationId: null }),
      blockedUserId: data.blockedUserId ?? null,
      blockedOrganizationId: data.blockedOrganizationId ?? null,
    },
  });
  const block = existing ?? (await prisma.chatBlock.create({ data }));

  emitConversationUpdated(participantIds, conversationId);
  return reply.status(existing ? 200 : 201).send(block);
}

// ─── LISTAR / DESFAZER BLOQUEIOS ─────────────────────────────────────────────

/** Bloqueios feitos por mim + (se sou da equipe de uma imobiliária) os feitos em nome dela. */
export async function listBlocks(request: FastifyRequest, reply: FastifyReply) {
  const { id: userId } = request.user as { id: string };
  const member = await prisma.organizationMember.findUnique({ where: { userId } });
  const organizationId = member?.status === 'ACTIVE' ? member.organizationId : null;

  const blocks = await prisma.chatBlock.findMany({
    where: { OR: [{ blockerId: userId }, ...(organizationId ? [{ blockerOrganizationId: organizationId }] : [])] },
    include: {
      blocker: { select: { id: true, name: true } },
      blockedUser: { select: { id: true, name: true, avatar: true } },
      blockedOrganization: { select: { id: true, name: true, logo: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  const items = await Promise.all(
    blocks.map(async (b) => ({
      id: b.id,
      createdAt: b.createdAt,
      scope: b.blockerOrganizationId ? 'ORGANIZATION' : 'PERSONAL',
      blockedBy: b.blocker,
      target: b.blockedUser
        ? { kind: 'USER', id: b.blockedUser.id, name: b.blockedUser.name, image: b.blockedUser.avatar }
        : { kind: 'ORGANIZATION', id: b.blockedOrganization?.id ?? '', name: b.blockedOrganization?.name ?? 'Imobiliária', image: b.blockedOrganization?.logo ?? null },
      canRemove: await canRemoveChatBlock(userId, b),
    }))
  );
  return reply.send(items);
}

export async function removeBlock(request: FastifyRequest, reply: FastifyReply) {
  const { id: userId } = request.user as { id: string };
  const { id } = request.params as { id: string };

  const block = await prisma.chatBlock.findUnique({ where: { id } });
  if (!block || !(await canRemoveChatBlock(userId, block))) {
    return reply.status(404).send({ message: 'Bloqueio não encontrado.' });
  }
  await prisma.chatBlock.delete({ where: { id } });
  return reply.send({ removed: true });
}
