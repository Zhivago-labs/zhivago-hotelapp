import type { ListingOperationType } from "@zhivago/shared";
import type { ChatMessage } from "@/lib/chat-api";

/** Mensagem como a tela guarda: a do servidor, ou uma otimista ainda sem confirmação. */
export interface LocalChatMessage extends ChatMessage {
  clientId?: string;
  localStatus?: "sending" | "failed";
}

const byCreatedAt = (a: ChatMessage, b: ChatMessage) =>
  new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();

/**
 * Junta mensagens novas na lista sem duplicar: a mesma mensagem pode chegar pelo callback do envio,
 * pelo socket (outra aba/aparelho do remetente) e por uma ressincronização — o `id` do banco é a
 * chave. Uma versão chegando de novo substitui a anterior (ex.: card de reserva que mudou de tipo).
 */
export function mergeMessages(prev: LocalChatMessage[], incoming: ChatMessage[]): LocalChatMessage[] {
  if (incoming.length === 0) return prev;
  const byId = new Map(prev.map((m) => [m.id, m]));
  for (const message of incoming) byId.set(message.id, { ...byId.get(message.id), ...message, localStatus: undefined });
  return [...byId.values()].sort(byCreatedAt);
}

/**
 * Lista completa vinda do servidor (`GET /messages`) substitui as confirmadas, mas preserva as
 * otimistas que ainda não foram confirmadas ou falharam — senão a ressincronização apagaria o que o
 * usuário acabou de digitar.
 */
export function replaceServerMessages(prev: LocalChatMessage[], server: ChatMessage[]): LocalChatMessage[] {
  // Uma "falha" pode ter sido gravada mesmo assim (a confirmação se perdeu no caminho): se o
  // servidor tem uma mensagem igual do mesmo remetente por volta do mesmo horário, a local sai.
  const local = prev.filter(
    (m) =>
      m.localStatus &&
      !server.some(
        (s) =>
          s.senderId === m.senderId &&
          s.content === m.content &&
          Math.abs(new Date(s.createdAt).getTime() - new Date(m.createdAt).getTime()) < 60_000
      )
  );
  return [...server, ...local].sort(byCreatedAt);
}

export function parseMetadata<T = Record<string, unknown>>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

const CARD_PREVIEW: Record<string, string> = {
  BOOKING_REQUEST: "📅 Solicitação de reserva",
  BOOKING_APPROVED: "📅 Reserva aprovada",
  BOOKING_REJECTED: "📅 Reserva recusada",
  BOOKING_CANCELLED: "📅 Reserva cancelada",
  OFFER_REQUEST: "🤝 Proposta de compra",
  OFFER_APPROVED: "🤝 Proposta aceita",
  OFFER_REJECTED: "🤝 Proposta recusada",
};

/** Texto curto da última mensagem pra lista de conversas. */
export function messagePreview(message: ChatMessage, viewerId: string | undefined): string {
  const text = message.type === "NEGOTIATION_ROUND" ? `🤝 ${message.content}` : CARD_PREVIEW[message.type] ?? message.content;
  return message.senderId === viewerId ? `Você: ${text}` : text;
}

export const OPERATION_LABEL: Record<ListingOperationType, string> = {
  SALE: "Venda",
  MONTHLY_RENT: "Aluguel mensal",
  DAILY_RENT: "Temporada",
};

export const PRICE_SUFFIX: Record<ListingOperationType, string> = {
  SALE: "",
  MONTHLY_RENT: "/mês",
  DAILY_RENT: "/noite",
};

export function formatDayLabel(value: string): string {
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Hoje";
  if (date.toDateString() === yesterday.toDateString()) return "Ontem";
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    ...(date.getFullYear() !== today.getFullYear() ? { year: "numeric" } : {}),
  });
}

export function avatarUrl(name: string | undefined, avatar: string | null | undefined): string {
  return avatar ?? `https://ui-avatars.com/api/?name=${encodeURIComponent(name ?? "?")}&background=FFE4E9&color=BE123C`;
}

let clientSeq = 0;

/** Id provisório da mensagem otimista (trocado pelo id do banco quando o servidor confirma). */
export function createClientId(): string {
  clientSeq += 1;
  return `local-${Date.now()}-${clientSeq}`;
}
