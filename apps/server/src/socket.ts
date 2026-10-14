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
 * Comandos de texto no chat — mesmo catálogo exposto ao front pelo menu "/" (`availableCommands` em
 * `GET /conversations/:id`, ver computeAvailableCommands em chat.controller.ts, que decide QUAIS
 * mostrar a cada momento). Todos usam a mesma checagem de permissão dos respectivos
 * botões/endpoints, então digitar o comando sem ser quem pode agir simplesmente falha, igual clicar
 * no botão sem permissão falharia.
 *
 * - `proposta`/`contraproposta <valor> [forma de pagamento]`: rodada de negociação de valor
 *   (lib/negotiations.ts) — a forma de pagamento só vale pra venda. Antes o único jeito de propor
 *   por comando era "/negociar <valor>", sem forma de pagamento, e quem tocava no comando no app
 *   enviava "/negociar" sem valor, que pro cliente só dava erro.
 * - `aprovar`/`recusar`: reserva ou proposta pendente — fallback de quando o botão não aparece.
 * - `retirar`: retira a própria proposta que ainda está pendente.
 * - `negociar`: sem valor, move o lead pra "Em negociação" no funil (lado do anúncio, organização);
 *   com valor continua funcionando como `proposta` (compatibilidade).
 * - `venda [valor]` (anunciante) / `comprar` (comprador): só venda. Fecham negócio mesmo quando o
 *   anúncio não aceita negociação — oferta do anunciante, ou compra pelo valor anunciado.
 *
 * `argument` diz ao front que o comando precisa de complemento (o menu preenche o comando e espera
 * o valor, em vez de enviar direto).
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
    label: 'Mover para negociação',
    description: 'Move o lead para "Em negociação" no funil do CRM',
  },
  {
    trigger: '/proposta',
    aliases: ['/propor', '/oferta', '/ofertar'],
    label: 'Proposta',
    description: 'Envia uma proposta de valor',
    argument: 'valor',
  },
  {
    trigger: '/contraproposta',
    aliases: ['/contrapropor', '/contra'],
    label: 'Contraproposta',
    description: 'Responde a proposta pendente com outro valor',
    argument: 'valor',
  },
  {
    trigger: '/retirar',
    aliases: ['/retirar-proposta', '/desistir'],
    label: 'Retirar proposta',
    description: 'Retira a sua proposta que ainda está pendente',
  },
  {
    trigger: '/venda',
    aliases: ['/vender', '/ofertar-venda'],
    label: 'Oferta de venda',
    description: 'Oferece o imóvel ao comprador — sem valor, usa o preço do anúncio',
    argument: 'valor (opcional)',
  },
  {
    trigger: '/comprar',
    aliases: ['/compra', '/quero-comprar'],
    label: 'Comprar',
    description: 'Manifesta a compra pelo valor anunciado',
    argument: 'forma de pagamento (opcional)',
  },
] as const;

const commandSet = (trigger: string) => {
  const command = CHAT_COMMANDS.find((c) => c.trigger === trigger)!;
  return new Set<string>([command.trigger, ...command.aliases]);
};
const APPROVE_COMMANDS = commandSet('/aprovar');
const REJECT_COMMANDS = commandSet('/recusar');
const NEGOTIATE_COMMANDS = commandSet('/negociar');
const PROPOSAL_COMMANDS = new Set<string>([...commandSet('/proposta'), ...commandSet('/contraproposta')]);
const WITHDRAW_COMMANDS = commandSet('/retirar');
const SALE_OFFER_COMMANDS = commandSet('/venda');
const BUY_COMMANDS = commandSet('/comprar');

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

/**
 * Rodada pendente da negociação aberta desta conversa, e de que lado ela veio em relação ao viewer:
 * `mine` = proposta pelo lado do viewer (pode retirar), `theirs` = pelo outro lado (pode
 * contrapropor/aceitar/recusar). Null sem negociação aberta ou sem rodada pendente válida.
 */
export async function findPendingRound(
  conversationId: string,
  viewerId: string
): Promise<{ offerId: string; from: 'mine' | 'theirs' } | null> {
  const negotiation = await prisma.negotiation.findFirst({
    where: { conversationId, status: 'OPEN' },
    include: { offers: { where: { status: 'PENDING' }, orderBy: { createdAt: 'desc' }, take: 1 } },
  });
  const offer = negotiation?.offers[0];
  if (!negotiation || !offer) return null;
  if (offer.expiresAt && offer.expiresAt < new Date()) return null;
  const proposerIsCustomer = offer.proposedById === negotiation.customerId;
  const viewerIsCustomer = viewerId === negotiation.customerId;
  return { offerId: offer.id, from: proposerIsCustomer === viewerIsCustomer ? 'mine' : 'theirs' };
}

type CommandConversation = {
  id: string;
  property: { id: string; ownerId: string | null; organizationId: string | null };
  participants: { id: string }[];
};

type CommandResult = { error?: string; success?: boolean };

const resultFrom = ({ status, body }: { status: number; body: unknown }, fallback: string): CommandResult =>
  status >= 300 ? { error: (body as { error?: string })?.error ?? fallback } : { success: true };

async function handleApproveRejectCommand(
  userId: string,
  conversation: CommandConversation,
  command: 'approve' | 'reject'
): Promise<CommandResult> {
  const canManage = await canManageListingConversation(
    userId,
    conversation.property,
    conversation.participants.map((p) => p.id)
  );
  const pending = await findActionablePending(conversation.id, userId, canManage);
  if (!pending) {
    return { error: 'Nenhuma solicitação de reserva ou proposta pendente para você responder nesta conversa.' };
  }

  const result =
    pending.kind === 'booking'
      ? await (command === 'approve' ? approveBookingCore : rejectBookingCore)(userId, pending.id)
      : await respondToRound({ actorId: userId, offerId: pending.id, action: command === 'approve' ? 'ACCEPT' : 'REJECT' });
  return resultFrom(result, 'Não foi possível concluir a ação.');
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

// Formas de pagamento aceitas no comando — mesmos rótulos do modal de proposta (web e app).
const PAYMENT_METHOD_PATTERNS: { label: string; pattern: RegExp }[] = [
  { label: 'À Vista', pattern: /^(a|à)?\s*vista$|^avista$|^pix$|^dinheiro$/ },
  { label: 'Financiamento', pattern: /^financ/ },
  { label: 'Parcelado', pattern: /^parcel/ },
  { label: 'Carta de Crédito', pattern: /^carta/ },
];

/**
 * Argumento de `/proposta`: o primeiro número é o valor e o resto, a forma de pagamento.
 * "450.000 financiamento", "R$ 450 mil à vista" não (só número), "1.250,50 parcelado".
 */
export function parseProposalArgument(raw: string): { value: number | null; paymentMethod: string | null; unknownMethod: string | null } {
  const match = raw.match(/\d[\d.,]*/);
  const value = match ? parseMoneyInput(match[0]) : null;
  const rest = (match ? raw.replace(match[0], ' ') : raw)
    .replace(/r\$/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/^(via|no|na|em|com|,|-)\s+/, '');
  if (!rest) return { value, paymentMethod: null, unknownMethod: null };
  const method = PAYMENT_METHOD_PATTERNS.find((m) => m.pattern.test(rest));
  return { value, paymentMethod: method?.label ?? null, unknownMethod: method ? null : rest };
}

async function handleProposalCommand(userId: string, conversation: CommandConversation, argument: string): Promise<CommandResult> {
  const { value, paymentMethod, unknownMethod } = parseProposalArgument(argument);
  if (value === null) {
    return { error: 'Informe o valor. Exemplo: /proposta 450000 financiamento' };
  }
  if (unknownMethod) {
    return { error: `Forma de pagamento "${unknownMethod}" não reconhecida. Use: à vista, financiamento, parcelado ou carta de crédito.` };
  }
  return resultFrom(
    await proposeRound({ actorId: userId, conversationId: conversation.id, value, paymentMethod }),
    'Não foi possível enviar a proposta.'
  );
}

/** Venda aprovada desta conversa + se o viewer é o lado do anúncio — base de /venda e /comprar. */
async function loadSaleContext(userId: string, conversation: CommandConversation) {
  const listing = await prisma.listing.findUnique({
    where: { id: conversation.property.id },
    select: { price: true, operationType: true, status: true },
  });
  const canManage = await canManageListingConversation(
    userId,
    conversation.property,
    conversation.participants.map((p) => p.id)
  );
  return { listing, canManage };
}

const formatPrice = (value: number) =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 });

/**
 * "/venda [valor] [forma]" — o anunciante oferece o imóvel ao comprador (vira um card "Oferta de
 * venda" com Comprar/Recusar do lado do comprador). Sem valor, usa o preço do anúncio. Funciona
 * mesmo em anúncio que não aceita negociação: quem define o preço é o próprio anunciante.
 */
async function handleSaleOfferCommand(userId: string, conversation: CommandConversation, argument: string): Promise<CommandResult> {
  const { listing, canManage } = await loadSaleContext(userId, conversation);
  if (!listing || listing.operationType !== 'SALE') return { error: 'O comando /venda é só para imóveis à venda.' };
  if (!canManage) return { error: 'Só o anunciante pode enviar uma oferta de venda. Para comprar, use /comprar.' };

  const { value, paymentMethod, unknownMethod } = parseProposalArgument(argument);
  if (unknownMethod) {
    return { error: `Forma de pagamento "${unknownMethod}" não reconhecida. Use: à vista, financiamento, parcelado ou carta de crédito.` };
  }
  return resultFrom(
    await proposeRound({ actorId: userId, conversationId: conversation.id, value: value ?? listing.price, paymentMethod }),
    'Não foi possível enviar a oferta de venda.'
  );
}

/**
 * "/comprar [forma]" — o comprador fecha pelo valor anunciado. É o caminho quando o anúncio não
 * aceita negociação de valor; com uma oferta do anunciante pendente, o certo é aceitá-la.
 */
async function handleBuyCommand(userId: string, conversation: CommandConversation, argument: string): Promise<CommandResult> {
  const { listing, canManage } = await loadSaleContext(userId, conversation);
  if (!listing || listing.operationType !== 'SALE') return { error: 'O comando /comprar é só para imóveis à venda.' };
  if (canManage) return { error: 'Você é o anunciante deste imóvel. Para oferecê-lo ao comprador, use /venda.' };

  const pending = await findPendingRound(conversation.id, userId);
  if (pending?.from === 'theirs') {
    const offer = await prisma.offer.findUnique({ where: { id: pending.offerId }, select: { value: true } });
    return { error: `Há uma oferta pendente de ${formatPrice(offer?.value ?? listing.price)}. Para comprar por esse valor, use /aceitar.` };
  }

  const { value, paymentMethod, unknownMethod } = parseProposalArgument(argument);
  if (value !== null && Math.abs(value - listing.price) > 0.005) {
    return { error: `/comprar usa o valor anunciado (${formatPrice(listing.price)}). Para propor outro valor, use /proposta.` };
  }
  if (unknownMethod) {
    return { error: `Forma de pagamento "${unknownMethod}" não reconhecida. Use: à vista, financiamento, parcelado ou carta de crédito.` };
  }
  return resultFrom(
    await proposeRound({ actorId: userId, conversationId: conversation.id, value: listing.price, paymentMethod }),
    'Não foi possível registrar a compra.'
  );
}

async function handleWithdrawCommand(userId: string, conversation: CommandConversation): Promise<CommandResult> {
  const pending = await findPendingRound(conversation.id, userId);
  if (!pending || pending.from !== 'mine') {
    return { error: 'Você não tem uma proposta pendente para retirar nesta conversa.' };
  }
  return resultFrom(
    await respondToRound({ actorId: userId, offerId: pending.offerId, action: 'WITHDRAW' }),
    'Não foi possível retirar a proposta.'
  );
}

const NEGOTIATE_ERROR_MESSAGES: Record<string, string> = {
  NOT_ORG_LISTING: 'Este comando só move o lead de imóveis de organização. Para propor um valor: /proposta 450000',
  NO_LEAD: 'Não existe um Lead de CRM associado a esta conversa.',
  ALREADY_THERE: 'Este lead já está em negociação.',
  FORBIDDEN: 'Para propor um valor, use /proposta seguido do valor, ex.: /proposta 450000',
};

async function handleNegotiateCommand(
  userId: string,
  conversation: CommandConversation,
  argument: string
): Promise<CommandResult> {
  // Compatibilidade: "/negociar 450000" continua enviando proposta.
  if (argument) return handleProposalCommand(userId, conversation, argument);

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
        const { conversationId } = data ?? {};
        const content = typeof data?.content === 'string' ? data.content : '';
        if (!conversationId || !content.trim()) {
          if (callback) callback({ error: 'Mensagem vazia.' });
          return;
        }

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
        // Comandos com argumento: "/proposta 450000 financiamento", "/negociar", "/retirar"...
        const [commandWord = '', ...commandArgs] = trimmedContent.split(/\s+/);
        const commandArgument = commandArgs.join(' ');
        const commandHandler = PROPOSAL_COMMANDS.has(commandWord)
          ? () => handleProposalCommand(user.id, conversation, commandArgument)
          : WITHDRAW_COMMANDS.has(commandWord)
            ? () => handleWithdrawCommand(user.id, conversation)
            : SALE_OFFER_COMMANDS.has(commandWord)
              ? () => handleSaleOfferCommand(user.id, conversation, commandArgument)
              : BUY_COMMANDS.has(commandWord)
                ? () => handleBuyCommand(user.id, conversation, commandArgument)
                : NEGOTIATE_COMMANDS.has(commandWord)
                  ? () => handleNegotiateCommand(user.id, conversation, commandArgument)
                  : null;
        if (commandHandler) {
          const result = await commandHandler();
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

        // Retorna sucesso para o remetente (com a mensagem gerada e ID do banco) via callback de
        // confirmação — antes das notificações, pra mensagem aparecer na hora pra quem enviou.
        if (callback) callback({ success: true, message });

        // Outras abas/aparelhos do próprio remetente (`socket.to` exclui esta conexão, que já
        // recebeu pelo callback) — antes a mensagem só aparecia no aparelho que enviou.
        socket.to(roomName).emit('receiveMessage', message);

        // Todos os outros participantes (não só o "primeiro outro": a conversa pode ter mais de dois
        // durante uma reatribuição de Lead). Os clientes deduplicam por `id`.
        const recipients = conversation.participants.filter(p => p.id !== user.id);
        for (const recipient of recipients) {
          io.to(`room_${recipient.id}`).emit('receiveMessage', message);
        }
        for (const recipient of recipients) {
          // Dispara notificação (push vai só se o destinatário tiver algum device registrado)
          await sendNotification({
            userId: recipient.id,
            title: `Nova mensagem de ${message.sender.name}`,
            message: content,
            type: 'MESSAGE',
          });
        }
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
