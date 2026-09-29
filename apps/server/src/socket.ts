import { Server as SocketIOServer } from 'socket.io';
import { prisma } from './lib/prisma.js';
import jwt from 'jsonwebtoken';
import { sendNotification } from './services/notification.service.js';
import { JWT_SECRET } from './lib/env.js';
import { approveBookingCore, rejectBookingCore } from './controllers/bookings.controller.js';
import { proposeRound, respondToRound } from './lib/negotiations.js';
import { moveLeadToNegotiationFromChatCommand, canManageListingConversation } from './lib/leads.js';
let ioInstance: SocketIOServer | null = null;

/**
 * Comandos de texto no chat — mesmo catálogo exposto ao front pelo menu "/" (`GET
 * /conversations/:id/commands`, ver chat.controller.ts). `aprovar`/`recusar` são um fallback pra
 * quando o botão de ação não aparece (ex.: front desatualizado em cache) ou não é clicável por
 * algum motivo. `negociar <valor>` envia uma proposta de valor (lib/negotiations.ts); sem valor,
 * só move o lead pra "Em negociação" no funil. Todos usam a mesma checagem de permissão dos
 * respectivos botões/endpoints, então digitar o comando sem ser quem pode agir simplesmente
 * falha, igual clicar no botão sem permissão falharia.
 */
export const CHAT_COMMANDS = [
  {
    trigger: '/aprovar',
    aliases: ['/aprovado', '/aceitar', '/aceito'],
    label: 'Aprovar',
    description: 'Aprova a reserva ou aceita a proposta pendente nesta conversa',
  },
  {
    trigger: '/recusar',
    aliases: ['/recusado', '/rejeitar', '/rejeitado'],
    label: 'Recusar',
    description: 'Recusa a reserva ou proposta pendente nesta conversa',
  },
  {
    trigger: '/negociar',
    aliases: ['/negociação', '/negociacao', '/negociando'],
    label: 'Negociar',
    description: '"/negociar 450000" envia uma proposta de valor; sem valor, move o lead para "Em negociação"',
  },
] as const;

const APPROVE_COMMANDS = new Set<string>([CHAT_COMMANDS[0].trigger, ...CHAT_COMMANDS[0].aliases]);
const REJECT_COMMANDS = new Set<string>([CHAT_COMMANDS[1].trigger, ...CHAT_COMMANDS[1].aliases]);
const NEGOTIATE_COMMANDS = new Set<string>([CHAT_COMMANDS[2].trigger, ...CHAT_COMMANDS[2].aliases]);

/**
 * A solicitação mais recente desta conversa que o viewer ainda pode aprovar/recusar: reserva
 * PENDING (só o lado do anúncio) ou rodada de negociação PENDING proposta pelo OUTRO lado. Antes
 * o comando pegava a última solicitação mesmo já respondida.
 */
export async function findActionablePending(
  conversationId: string,
  viewerId: string,
  canManage: boolean
): Promise<{ kind: 'booking' | 'offer'; id: string } | null> {
  const candidates = await prisma.message.findMany({
    where: { conversationId, type: { in: ['BOOKING_REQUEST', 'OFFER_REQUEST', 'NEGOTIATION_ROUND'] } },
    orderBy: { createdAt: 'desc' },
    take: 30,
    select: { type: true, metadata: true },
  });

  for (const candidate of candidates) {
    let metadata: { bookingId?: string; offerId?: string } = {};
    try {
      metadata = candidate.metadata ? JSON.parse(candidate.metadata) : {};
    } catch {
      continue;
    }

    if (candidate.type === 'BOOKING_REQUEST') {
      if (!canManage || !metadata.bookingId) continue;
      const booking = await prisma.booking.findUnique({ where: { id: metadata.bookingId }, select: { status: true } });
      if (booking?.status === 'PENDING') return { kind: 'booking', id: metadata.bookingId };
      continue;
    }

    if (!metadata.offerId) continue;
    const offer = await prisma.offer.findUnique({
      where: { id: metadata.offerId },
      include: { negotiation: { select: { status: true, customerId: true } } },
    });
    if (!offer || offer.status !== 'PENDING' || offer.negotiation.status !== 'OPEN') continue;
    if (offer.expiresAt && offer.expiresAt < new Date()) continue;
    const proposerIsCustomer = offer.proposedById === offer.negotiation.customerId;
    const viewerIsCustomer = viewerId === offer.negotiation.customerId;
    if (proposerIsCustomer !== viewerIsCustomer && (viewerIsCustomer || canManage)) {
      return { kind: 'offer', id: offer.id };
    }
  }
  return null;
}

type CommandConversation = {
  id: string;
  property: { id: string; ownerId: string | null; organizationId: string | null };
  participants: { id: string }[];
};

async function handleApproveRejectCommand(
  userId: string,
  conversation: CommandConversation,
  command: 'approve' | 'reject'
): Promise<{ error?: string; success?: boolean }> {
  const canManage = await canManageListingConversation(
    userId,
    conversation.property,
    conversation.participants.map((p) => p.id)
  );
  const pending = await findActionablePending(conversation.id, userId, canManage);
  if (!pending) {
    return { error: 'Nenhuma solicitação de reserva ou proposta pendente para você responder nesta conversa.' };
  }

  const { status, body } =
    pending.kind === 'booking'
      ? await (command === 'approve' ? approveBookingCore : rejectBookingCore)(userId, pending.id)
      : await respondToRound({ actorId: userId, offerId: pending.id, action: command === 'approve' ? 'ACCEPT' : 'REJECT' });
  if (status >= 300) {
    return { error: (body as { error?: string })?.error ?? 'Não foi possível concluir a ação.' };
  }
  return { success: true };
}

/** "450.000", "450000", "R$ 1.250,50" → número; null se não der pra ler um valor. */
export function parseMoneyInput(raw: string): number | null {
  const cleaned = raw.replace(/[^\d,.]/g, '');
  if (!cleaned) return null;
  let normalized: string;
  if (cleaned.includes(',')) normalized = cleaned.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(cleaned)) normalized = cleaned.replace(/\./g, '');
  else normalized = cleaned;
  const value = Number(normalized);
  return Number.isFinite(value) && value > 0 ? value : null;
}

const NEGOTIATE_ERROR_MESSAGES: Record<string, string> = {
  NOT_ORG_LISTING: 'Sem valor, este comando só move o lead de imóveis de organização. Para propor um valor: /negociar 450000',
  NO_LEAD: 'Não existe um Lead de CRM associado a esta conversa.',
  ALREADY_THERE: 'Este lead já está em negociação.',
  FORBIDDEN: 'Para propor um valor, use "/negociar" seguido do valor, ex.: /negociar 450000',
};

async function handleNegotiateCommand(
  userId: string,
  conversation: CommandConversation,
  argument: string
): Promise<{ error?: string; success?: boolean }> {
  if (argument) {
    const value = parseMoneyInput(argument);
    if (value === null) return { error: 'Valor inválido. Exemplo: /negociar 450000' };
    const { status, body } = await proposeRound({ actorId: userId, conversationId: conversation.id, value });
    if (status >= 300) return { error: (body as { error?: string })?.error ?? 'Não foi possível enviar a proposta.' };
    return { success: true };
  }

  const result = await moveLeadToNegotiationFromChatCommand(
    userId,
    conversation.property,
    conversation.participants.map((p) => p.id)
  );
  if (!result.ok) {
    return { error: NEGOTIATE_ERROR_MESSAGES[result.reason] ?? 'Não foi possível concluir a ação.' };
  }
  return { success: true };
}

export function setupSocket(io: SocketIOServer) {
  ioInstance = io;


  io.use(async (socket, next) => {
    const token = socket.handshake.auth['token'];
    if (!token) {
      return next(new Error('Authentication error: Token missing'));
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { id: string; role: string; tokenVersion?: number };

      // Revalida estado do usuário no banco a cada conexão WebSocket
      const dbUser = await prisma.user.findUnique({
        where: { id: decoded.id },
        select: { id: true, role: true, status: true, tokenVersion: true },
      });

      if (!dbUser || dbUser.status !== 'ACTIVE') {
        return next(new Error('Authentication error: Account suspended or not found'));
      }

      if (decoded.tokenVersion !== undefined && decoded.tokenVersion !== dbUser.tokenVersion) {
        return next(new Error('Authentication error: Session expired'));
      }

      // Usa dados atuais do banco, não do token
      socket.data.user = { id: dbUser.id, role: dbUser.role };
      next();
    } catch (error) {
      next(new Error('Authentication error: Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const user = socket.data.user;
  
    const roomName = `room_${user.id}`;
    socket.join(roomName);
    console.log(`User ${user.id} connected and joined ${roomName}`);

    // Ouvir envio de mensagens enviado pelo app (React Native)
    socket.on('sendMessage', async (data: { conversationId: string, content: string }, callback) => {
      try {
        const { conversationId, content } = data;

        // Validação de Segurança: Garante que a conversa existe e que o usuário solicitante
        // é de fato um dos participantes (comprador ou vendedor) dela
        const conversation = await prisma.conversation.findUnique({
          where: { id: conversationId },
          include: {
            participants: { select: { id: true } },
            property: { select: { id: true, ownerId: true, organizationId: true } },
          }
        });

        if (!conversation || !conversation.participants.some(p => p.id === user.id)) {
          if (callback) callback({ error: 'Conversation not found or access denied' });
          return;
        }

        // Se o administrador encerrou/bloqueou a conversa, impede novas mensagens
        if ((conversation as any).isClosed) {
          if (callback) callback({ error: 'Conversation is closed by admin' });
          return;
        }

        // Comandos de texto (ver CHAT_COMMANDS acima) — nunca viram uma mensagem normal, agem
        // direto sobre o lead/reserva/proposta e a confirmação chega via o mecanismo de cada um
        // (mesma mensagem e socket emit de quando se clica no botão, no caso de aprovar/recusar).
        const trimmedContent = content.trim().toLowerCase();
        if (APPROVE_COMMANDS.has(trimmedContent) || REJECT_COMMANDS.has(trimmedContent)) {
          const result = await handleApproveRejectCommand(
            user.id,
            conversation,
            APPROVE_COMMANDS.has(trimmedContent) ? 'approve' : 'reject'
          );
          if (callback) callback(result);
          return;
        }
        // "/negociar" sozinho ou "/negociar <valor>"
        const [commandWord = '', ...commandArgs] = trimmedContent.split(/\s+/);
        if (NEGOTIATE_COMMANDS.has(commandWord)) {
          const result = await handleNegotiateCommand(user.id, conversation, commandArgs.join(' '));
          if (callback) callback(result);
          return;
        }

        // Grava a mensagem no banco de dados com relacionamento ao remetente
        const message = await prisma.message.create({
          data: {
            content,
            senderId: user.id,
            conversationId
          },
          include: {
            sender: {
              select: { id: true, name: true, avatar: true }
            }
          }
        });

        // Atualiza o timestamp da conversa para que ela suba no topo da caixa de entrada dos usuários
        await prisma.conversation.update({
          where: { id: conversationId },
          data: { updatedAt: new Date() }
        });

        // Identifica quem é o outro participante da conversa para notificá-lo
        const recipient = conversation.participants.find(p => p.id !== user.id);
        
        if (recipient) {
          // Emite a mensagem em tempo real para a sala exclusiva do destinatário
          io.to(`room_${recipient.id}`).emit('receiveMessage', message);

          // Dispara notificação (push vai só se o destinatário tiver algum device registrado)
          await sendNotification({
            userId: recipient.id,
            title: `Nova mensagem de ${message.sender.name}`,
            message: content,
            type: 'MESSAGE',
          });
        }

        // Retorna sucesso para o remetente (com a mensagem gerada e ID do banco) via callback de confirmação
        if (callback) callback({ success: true, message });
      } catch (error) {
        console.error('Error handling sendMessage:', error);
        if (callback) callback({ error: 'Internal server error' });
      }
    });

    socket.on('disconnect', () => {
      console.log(`User ${user.id} disconnected`);
    });
  });
}

/**
 * Retorna a instância ativa do Socket.io para envio de eventos a partir de rotas HTTP normais.
 */
export function getIO(): SocketIOServer {
  if (!ioInstance) {
    throw new Error('Socket.io not initialized');
  }
  return ioInstance;
}
