"use client";

import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { Flag, Lock, Unlock, Send, Handshake, CalendarRange, WifiOff, RotateCcw, ArrowDown } from "lucide-react";
import type { Negotiation, NegotiationRound } from "@zhivago/shared";
import { useChatSocket } from "./ChatSocketProvider";
import {
  deltaText,
  formatBRL,
  NegotiationModal,
  NegotiationRoundCard,
  parseProposalArgument,
  PAYMENT_METHODS,
  type NegotiationModalMode,
} from "./NegotiationWidgets";
import {
  createClientId,
  formatDayLabel,
  mergeMessages,
  OPERATION_LABEL,
  parseMetadata,
  PRICE_SUFFIX,
  replaceServerMessages,
  type LocalChatMessage,
} from "./chat-utils";
import { getPublicApiUrl } from "@/lib/public-api";
import type { ChatCommand, ChatMessage, ConversationDetail } from "@/lib/chat-api";
import styles from "./ChatConversation.module.css";

interface ChatConversationProps {
  conversation: ConversationDetail;
  initialMessages: ChatMessage[];
  token: string;
  currentUser: { id: string; role: string; name: string };
}

const CARD_TYPES = new Set([
  "NEGOTIATION_ROUND",
  "OFFER_REQUEST",
  "OFFER_APPROVED",
  "OFFER_REJECTED",
  "BOOKING_REQUEST",
  "BOOKING_APPROVED",
  "BOOKING_REJECTED",
  "BOOKING_CANCELLED",
]);

// Mensagens do mesmo remetente com menos que isso de intervalo viram um "bloco" (sem repetir hora).
const GROUP_WINDOW_MS = 5 * 60 * 1000;
const SEND_TIMEOUT_MS = 15_000;

// "/proposta 450000 financiamento" e aliases (ver CHAT_COMMANDS em socket.ts); "/negociar" só com valor.
const PROPOSAL_COMMAND_RE =
  /^(\/(?:proposta|propor|oferta|ofertar|contraproposta|contrapropor|contra|venda|vender|ofertar-venda|comprar|compra|quero-comprar)(?=\s|$)|\/(?:negociar|negocia[çc][ãa]o|negociando)(?=\s+\S))\s*(.*)$/i;
const SALE_OFFER_RE = /^\/(venda|vender|ofertar-venda)$/i;
const BUY_RE = /^\/(comprar|compra|quero-comprar)$/i;

function upsertNegotiation(list: Negotiation[], next: Negotiation): Negotiation[] {
  return list.some((n) => n.id === next.id) ? list.map((n) => (n.id === next.id ? next : n)) : [...list, next];
}

function formatPrice(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

async function patchConversation(token: string, id: string, path: string): Promise<boolean> {
  const res = await fetch(`${getPublicApiUrl()}/conversations/${id}/${path}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.ok;
}

async function patchRequest(
  token: string,
  kind: "bookings" | "offers",
  id: string,
  action: "approve" | "reject"
): Promise<string | null> {
  try {
    const res = await fetch(`${getPublicApiUrl()}/${kind}/${id}/${action}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) return null;
    const data = await res.json().catch(() => null);
    return data?.error ?? "Não foi possível concluir a ação. Tente novamente.";
  } catch {
    return "Não foi possível conectar ao servidor.";
  }
}

export function ChatConversation({ conversation: initialConversation, initialMessages, token, currentUser }: ChatConversationProps) {
  const { socket, isConnected, refreshUnreadCount } = useChatSocket();
  // A conversa (permissões, comandos disponíveis) é recarregada a cada ressincronização — o que o
  // viewer pode fazer muda conforme reservas/propostas são respondidas.
  const [conversation, setConversation] = useState(initialConversation);
  const [messages, setMessages] = useState<LocalChatMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isClosed, setIsClosed] = useState(initialConversation.isClosed);
  const [isReported, setIsReported] = useState(initialConversation.isReported);
  const [negotiations, setNegotiations] = useState<Negotiation[]>([]);
  const [busyRequestId, setBusyRequestId] = useState<string | null>(null);
  // null = fechado; { counterTo: null } = proposta nova; com counterTo = contraproposta. `mode`
  // "sale"/"buy" = oferta de venda do anunciante / compra pelo valor anunciado.
  const [negotiationModal, setNegotiationModal] = useState<{
    counterTo: { negotiation: Negotiation; round: NegotiationRound } | null;
    mode?: NegotiationModalMode;
  } | null>(null);
  const [commandMenuIndex, setCommandMenuIndex] = useState(0);
  const [commandMenuDismissed, setCommandMenuDismissed] = useState(false);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const nearBottomRef = useRef(true);
  const firstScrollRef = useRef(true);
  const resyncSeqRef = useRef(0);

  const conversationId = conversation.id;
  const isParticipant = conversation.participants.some((p) => p.id === currentUser.id);
  const isAdmin = currentUser.role === "ADMIN";
  const isAuditor = !isParticipant && isAdmin;
  const isOwner = conversation.property.ownerId === currentUser.id;
  const other = conversation.participants.find((p) => p.id !== currentUser.id);

  // Negociação de valor (lib/negotiations.ts no backend): o lado do viewer é o do anúncio quando
  // ele pode gerenciar a conversa; senão é o cliente.
  const viewerSide = conversation.canManage ? "LISTING" : "CUSTOMER";
  const canActOnNegotiation = isParticipant && !isAuditor && !isClosed;
  const canNegotiate =
    canActOnNegotiation && conversation.property.acceptsNegotiation && conversation.property.status === "APPROVED";
  const isSale = conversation.property.operationType === "SALE";
  // Venda dá pra fechar mesmo sem negociação: o anunciante oferece (/venda) e o comprador compra
  // pelo valor anunciado (/comprar). Contraproposta só se o anúncio aceitar negociar (ou pro
  // anunciante, que define o preço).
  const canCloseSale = canActOnNegotiation && isSale && conversation.property.status === "APPROVED";
  const canCounter = conversation.property.acceptsNegotiation || conversation.canManage;
  const openNegotiation = negotiations.find((n) => n.status === "OPEN");
  const pendingRound = openNegotiation?.rounds.find((r) => r.status === "PENDING");
  const waitingOnOther = !!pendingRound && pendingRound.side === viewerSide;

  // Menu de "/" (autocomplete de comandos, ver docs do backend em socket.ts CHAT_COMMANDS): digitar
  // "/" abre a lista dos comandos que fazem sentido AGORA nesta conversa (já vem filtrada pelo
  // backend em `conversation.availableCommands` — vazio se o viewer não pode agir); continuar
  // digitando filtra pelo texto após a "/".
  const slashQuery = input.startsWith("/") ? input.toLowerCase() : null;
  const matchingCommands =
    slashQuery !== null
      ? conversation.availableCommands.filter(
          (cmd) => cmd.trigger.startsWith(slashQuery) || cmd.aliases.some((alias) => alias.startsWith(slashQuery))
        )
      : [];
  const showCommandMenu = !commandMenuDismissed && !isClosed && isParticipant && matchingCommands.length > 0;

  // Prévia de "/proposta <valor> [forma de pagamento]" enquanto se digita: mostra o valor lido, a
  // diferença pro anúncio e, na venda, atalhos de forma de pagamento.
  const proposalMatch = canNegotiate || canCloseSale ? input.match(PROPOSAL_COMMAND_RE) : null;
  const proposalDraft = proposalMatch
    ? {
        command: proposalMatch[1]!,
        kind: SALE_OFFER_RE.test(proposalMatch[1]!) ? "sale" : BUY_RE.test(proposalMatch[1]!) ? "buy" : "propose",
        parsed: parseProposalArgument(proposalMatch[2] ?? ""),
      }
    : null;
  // Forma de pagamento sendo digitada ("/proposta 450000 fin") — vira sugestão em cinza + Tab.
  const partialMethod = proposalDraft?.parsed.unknownMethod
    ? PAYMENT_METHODS.find((m) => m.toLowerCase().startsWith(proposalDraft.parsed.unknownMethod!))
    : undefined;

  /**
   * Autocomplete: o que falta pra completar o que está sendo digitado — o comando destacado no
   * menu ("/pro" → "posta") ou a forma de pagamento ("fin" → "anciamento"). Aparece em cinza
   * dentro do campo e Tab aceita.
   */
  const highlightedCommand = showCommandMenu ? matchingCommands[commandMenuIndex] : undefined;
  const highlightedName = highlightedCommand
    ? [highlightedCommand.trigger, ...highlightedCommand.aliases].find((name) => name.startsWith(slashQuery ?? ""))
    : undefined;
  const ghostSuffix =
    highlightedName && !input.includes(" ")
      ? highlightedName.slice(input.length)
      : isSale && partialMethod && proposalDraft?.parsed.unknownMethod
        ? partialMethod.slice(proposalDraft.parsed.unknownMethod.length)
        : "";

  const authHeaders = { Authorization: `Bearer ${token}` };

  const markAsRead = useCallback(() => {
    if (!isParticipant) return;
    patchConversation(token, conversationId, "read")
      .then(() => refreshUnreadCount())
      .catch(() => {});
  }, [token, conversationId, isParticipant, refreshUnreadCount]);

  const loadDetail = useCallback(async () => {
    const res = await fetch(`${getPublicApiUrl()}/conversations/${conversationId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const data: ConversationDetail = await res.json();
    setConversation(data);
    setIsClosed(data.isClosed);
    setIsReported(data.isReported);
  }, [conversationId, token]);

  const loadNegotiations = useCallback(async () => {
    const res = await fetch(`${getPublicApiUrl()}/conversations/${conversationId}/negotiations`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const data: Negotiation[] = await res.json();
    setNegotiations(data);
  }, [conversationId, token]);

  /**
   * Busca de novo tudo o que a tela mostra. Chamada ao reconectar o socket e ao voltar pra aba: o
   * servidor não reenvia o que foi emitido enquanto a conexão estava caída, então sem isso as
   * mensagens desse intervalo simplesmente "sumiam" até recarregar a página.
   */
  const resync = useCallback(async () => {
    const seq = ++resyncSeqRef.current;
    try {
      const [msgRes] = await Promise.all([
        fetch(`${getPublicApiUrl()}/conversations/${conversationId}/messages`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        loadDetail(),
        loadNegotiations(),
      ]);
      if (!msgRes.ok || seq !== resyncSeqRef.current) return;
      const server: ChatMessage[] = await msgRes.json();
      if (seq !== resyncSeqRef.current) return;
      setMessages((prev) => replaceServerMessages(prev, server));
      markAsRead();
    } catch {
      // Sem rede — a próxima reconexão tenta de novo.
    }
  }, [conversationId, token, loadDetail, loadNegotiations, markAsRead]);

  useEffect(() => {
    markAsRead();
  }, [markAsRead]);

  useEffect(() => {
    let cancelled = false;
    fetch(`${getPublicApiUrl()}/conversations/${conversationId}/negotiations`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: Negotiation[] | null) => {
        if (!cancelled && data) setNegotiations(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [conversationId, token]);

  // Voltar pra aba depois de um tempo fora: o navegador pode ter suspendido a conexão.
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") resync();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [resync]);

  useEffect(() => {
    if (!socket) return;

    const handleReceive = (message: ChatMessage) => {
      if (message.conversationId !== conversationId) return;
      setMessages((prev) => mergeMessages(prev, [message]));
      if (message.senderId !== currentUser.id) markAsRead();
      // Card de reserva/proposta novo muda o que o viewer pode fazer (comandos de "/").
      if (CARD_TYPES.has(message.type)) loadDetail().catch(() => {});
    };

    // Estado de uma negociação mudou (nova rodada, aceite, recusa, expiração) — atualiza os cards
    // nas duas telas sem recarregar.
    const handleNegotiation = (negotiation: Negotiation) => {
      if (negotiation.conversationId !== conversationId) return;
      setNegotiations((prev) => upsertNegotiation(prev, negotiation));
      loadDetail().catch(() => {});
    };

    // Card de reserva respondido pelo outro lado.
    const handleMessageUpdated = (update: Pick<ChatMessage, "id" | "type" | "conversationId">) => {
      if (update.conversationId !== conversationId) return;
      setMessages((prev) => prev.map((m) => (m.id === update.id ? { ...m, type: update.type } : m)));
      loadDetail().catch(() => {});
    };

    socket.on("receiveMessage", handleReceive);
    socket.on("negotiationUpdated", handleNegotiation);
    socket.on("messageUpdated", handleMessageUpdated);
    socket.on("connect", resync);
    return () => {
      socket.off("receiveMessage", handleReceive);
      socket.off("negotiationUpdated", handleNegotiation);
      socket.off("messageUpdated", handleMessageUpdated);
      socket.off("connect", resync);
    };
  }, [socket, conversationId, currentUser.id, markAsRead, loadDetail, resync]);

  // Rolagem: só desce sozinho se o usuário já estava no fim (ou se a última mensagem é dele) —
  // antes qualquer mensagem nova arrancava quem estava lendo o histórico lá de cima.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const last = messages.at(-1);
    if (firstScrollRef.current || nearBottomRef.current || last?.senderId === currentUser.id) {
      el.scrollTo({ top: el.scrollHeight, behavior: firstScrollRef.current ? "auto" : "smooth" });
      firstScrollRef.current = false;
      setShowJumpToLatest(false);
    } else {
      setShowJumpToLatest(true);
    }
  }, [messages, currentUser.id]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (nearBottomRef.current) setShowJumpToLatest(false);
  };

  const jumpToLatest = () => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    setShowJumpToLatest(false);
  };

  // Campo de texto cresce com o conteúdo até um limite (o CSS define o máximo).
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [input]);

  const sendContent = (content: string) => {
    if (!content || !socket || isClosed || !isParticipant) return;
    setSendError(null);
    setInput("");
    setCommandMenuDismissed(false);

    const isCommand = content.startsWith("/");
    const clientId = createClientId();

    // Mensagem otimista: aparece na hora como "enviando" e é trocada pela do servidor na
    // confirmação. Comandos não viram mensagem, então não entram na lista.
    if (!isCommand) {
      const optimistic: LocalChatMessage = {
        id: clientId,
        clientId,
        localStatus: "sending",
        content,
        type: "TEXT",
        metadata: null,
        senderId: currentUser.id,
        conversationId,
        isRead: false,
        createdAt: new Date().toISOString(),
        sender: { id: currentUser.id, name: currentUser.name, avatar: null },
      };
      setMessages((prev) => [...prev, optimistic]);
    }

    const markFailed = (error: string) => {
      if (isCommand) setSendError(error);
      else setMessages((prev) => prev.map((m) => (m.clientId === clientId ? { ...m, localStatus: "failed" } : m)));
    };

    // Desconectado: o socket.io guardaria o envio e mandaria depois de reconectar — mas a tela já
    // teria marcado como falha e o "tentar de novo" duplicaria a mensagem. Falha na hora.
    if (!socket.connected) {
      markFailed("Sem conexão com o servidor. Tente novamente em instantes.");
      return;
    }

    socket
      .timeout(SEND_TIMEOUT_MS)
      .emit(
        "sendMessage",
        { conversationId, content },
        (err: Error | null, response?: { error?: string; success?: boolean; message?: ChatMessage }) => {
          if (err || !response) {
            markFailed("O servidor não respondeu. Tente novamente.");
            return;
          }
          if (response.error) {
            setMessages((prev) => prev.filter((m) => m.clientId !== clientId));
            setSendError(response.error);
            return;
          }
          if (response.message) {
            const confirmed = response.message;
            setMessages((prev) => mergeMessages(prev.filter((m) => m.clientId !== clientId), [confirmed]));
          } else {
            // Comando executado — o resultado chega pelos eventos de cada fluxo; atualiza os comandos.
            loadDetail().catch(() => {});
          }
        }
      );
  };

  const retryMessage = (message: LocalChatMessage) => {
    setMessages((prev) => prev.filter((m) => m.clientId !== message.clientId));
    sendContent(message.content);
  };

  const handleSend = (event: React.FormEvent) => {
    event.preventDefault();
    sendContent(input.trim());
  };

  const handleSelectCommand = (command: ChatCommand) => {
    // Comando que precisa de valor ("/proposta 450000"): deixa o cursor pronto pra digitá-lo em vez
    // de enviar sem nada — a prévia abaixo do campo guia o resto.
    if (command.argument) {
      setInput(`${command.trigger} `);
      setCommandMenuDismissed(true);
      inputRef.current?.focus();
      return;
    }
    sendContent(command.trigger);
  };

  const fillPaymentMethod = (method: string) => {
    if (!proposalDraft) return;
    setInput(`${proposalDraft.command} ${proposalDraft.parsed.valueText || ""}${proposalDraft.parsed.valueText ? " " : ""}${method}`);
    inputRef.current?.focus();
  };

  const handleInputChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = event.target.value;
    setInput(value);
    setCommandMenuIndex(0);
    if (!value.startsWith("/")) setCommandMenuDismissed(false);
  };

  /** Tab: aceita a sugestão em cinza (comando ou forma de pagamento). */
  const acceptGhost = (): boolean => {
    if (!ghostSuffix) return false;
    if (highlightedCommand && highlightedName && !input.includes(" ")) {
      setInput(highlightedCommand.argument ? `${highlightedName} ` : highlightedName);
      if (highlightedCommand.argument) setCommandMenuDismissed(true);
    } else {
      setInput(`${input}${ghostSuffix}`);
    }
    return true;
  };

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Tab" && !event.shiftKey && acceptGhost()) {
      event.preventDefault();
      return;
    }
    if (showCommandMenu) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setCommandMenuIndex((i) => (i + 1) % matchingCommands.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setCommandMenuIndex((i) => (i - 1 + matchingCommands.length) % matchingCommands.length);
        return;
      }
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        handleSelectCommand(matchingCommands[commandMenuIndex]!);
        return;
      }
      if (event.key === "Escape") {
        setCommandMenuDismissed(true);
        return;
      }
    }
    // Enter envia; Shift+Enter quebra linha.
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendContent(input.trim());
    }
  };

  const handleReport = async () => {
    if (!confirm("Denunciar esta conversa para a administração?")) return;
    if (await patchConversation(token, conversationId, "report")) setIsReported(true);
  };

  const handleToggleClose = async () => {
    const path = isClosed ? "reopen" : "close";
    if (await patchConversation(token, conversationId, path)) setIsClosed(!isClosed);
  };

  /** Envia proposta ou contraproposta; devolve a mensagem de erro, ou null se deu certo. */
  const handleSubmitRound = async (value: number, paymentMethod: string | null): Promise<string | null> => {
    try {
      const res = await fetch(`${getPublicApiUrl()}/conversations/${conversationId}/negotiations/rounds`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ value, paymentMethod }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) return data?.error ?? "Não foi possível enviar a proposta.";
      // A mensagem do card e o estado também chegam pelo socket — aplicados aqui caso ele esteja
      // desconectado (o merge por id evita duplicar).
      if (data?.negotiation) setNegotiations((prev) => upsertNegotiation(prev, data.negotiation));
      if (data?.message) setMessages((prev) => mergeMessages(prev, [data.message]));
      setNegotiationModal(null);
      return null;
    } catch {
      return "Não foi possível conectar ao servidor.";
    }
  };

  const handleRoundAction = async (roundId: string, action: "accept" | "reject" | "withdraw") => {
    if (action === "accept") {
      const round = negotiations.flatMap((n) => n.rounds).find((r) => r.id === roundId);
      const message =
        isSale && round
          ? `${viewerSide === "CUSTOMER" ? "Confirmar a compra" : "Aceitar a venda"} por ${formatBRL(round.value)}? O imóvel será marcado como vendido.`
          : "Aceitar esta proposta? O valor passa a valer como acordado.";
      if (!confirm(message)) return;
    }
    setActionError(null);
    try {
      const res = await fetch(`${getPublicApiUrl()}/offers/${roundId}/${action}`, {
        method: "PATCH",
        headers: authHeaders,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setActionError(data?.error ?? "Não foi possível concluir a ação. Tente novamente.");
        // Provavelmente o estado mudou do outro lado — traz a versão atual.
        resync();
        return;
      }
      if (data?.id) setNegotiations((prev) => upsertNegotiation(prev, data as Negotiation));
    } catch {
      setActionError("Não foi possível conectar ao servidor.");
    }
  };

  const openNegotiationModal = (mode: NegotiationModalMode = "propose") => {
    if (mode === "propose" && pendingRound && openNegotiation && pendingRound.side !== viewerSide) {
      setNegotiationModal({ counterTo: { negotiation: openNegotiation, round: pendingRound } });
    } else {
      setNegotiationModal({ counterTo: null, mode });
    }
  };

  const handleRespond = async (
    kind: "bookings" | "offers",
    id: string,
    action: "approve" | "reject",
    messageId: string
  ) => {
    setActionError(null);
    setBusyRequestId(messageId);
    const error = await patchRequest(token, kind, id, action);
    setBusyRequestId(null);
    if (error) {
      setActionError(error);
      resync();
      return;
    }
    const resolvedType =
      kind === "bookings"
        ? action === "approve"
          ? "BOOKING_APPROVED"
          : "BOOKING_REJECTED"
        : action === "approve"
          ? "OFFER_APPROVED"
          : "OFFER_REJECTED";
    setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, type: resolvedType } : m)));
  };

  function renderCard(message: LocalChatMessage) {
    if (message.type === "NEGOTIATION_ROUND") {
      const meta = parseMetadata<{ negotiationId?: string; offerId?: string }>(message.metadata) ?? {};
      return (
        <NegotiationRoundCard
          negotiation={negotiations.find((n) => n.id === meta.negotiationId)}
          roundId={meta.offerId ?? ""}
          fallbackContent={message.content}
          viewerId={currentUser.id}
          viewerSide={viewerSide}
          canAct={canActOnNegotiation}
          canCounter={canCounter}
          onAction={handleRoundAction}
          onCounter={(negotiation, round) => setNegotiationModal({ counterTo: { negotiation, round } })}
        />
      );
    }

    const canRespond = !isAuditor && conversation.canManage && isParticipant && !isClosed;
    const busy = busyRequestId === message.id;

    if (message.type.startsWith("OFFER_")) {
      const metadata = parseMetadata<{ value?: number; paymentMethod?: string; offerId?: string }>(message.metadata);
      return (
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.cardIcon}>
              <Handshake size={15} />
            </span>
            <span className={styles.cardTitle}>Proposta de compra</span>
            {message.type === "OFFER_APPROVED" && <span className={`${styles.pill} ${styles.pillOk}`}>Aceita</span>}
            {message.type === "OFFER_REJECTED" && <span className={`${styles.pill} ${styles.pillBad}`}>Recusada</span>}
            {message.type === "OFFER_REQUEST" && <span className={`${styles.pill} ${styles.pillPending}`}>Pendente</span>}
          </div>
          {metadata?.value != null ? (
            <>
              <p className={styles.cardValue}>{formatPrice(Number(metadata.value))}</p>
              {metadata.paymentMethod && <p className={styles.cardMeta}>Pagamento: {metadata.paymentMethod}</p>}
            </>
          ) : (
            <p className={styles.cardMeta}>{message.content}</p>
          )}
          {message.type === "OFFER_REQUEST" && canRespond && metadata?.offerId && (
            <div className={styles.cardActions}>
              <button
                type="button"
                className={styles.approveButton}
                disabled={busy}
                onClick={() => handleRespond("offers", metadata.offerId!, "approve", message.id)}
              >
                Aceitar
              </button>
              <button
                type="button"
                className={styles.rejectButton}
                disabled={busy}
                onClick={() => handleRespond("offers", metadata.offerId!, "reject", message.id)}
              >
                Recusar
              </button>
            </div>
          )}
        </div>
      );
    }

    const metadata = parseMetadata<{ bookingId?: string; startDate?: string; endDate?: string }>(message.metadata);
    const nights =
      metadata?.startDate && metadata.endDate
        ? Math.round((new Date(metadata.endDate).getTime() - new Date(metadata.startDate).getTime()) / 86_400_000)
        : null;
    const isPending = message.type === "BOOKING_REQUEST";

    return (
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <span className={styles.cardIcon}>
            <CalendarRange size={15} />
          </span>
          <span className={styles.cardTitle}>Solicitação de reserva</span>
          {message.type === "BOOKING_APPROVED" && <span className={`${styles.pill} ${styles.pillOk}`}>Aprovada</span>}
          {message.type === "BOOKING_REJECTED" && <span className={`${styles.pill} ${styles.pillBad}`}>Recusada</span>}
          {message.type === "BOOKING_CANCELLED" && <span className={`${styles.pill} ${styles.pillMuted}`}>Cancelada</span>}
          {isPending && <span className={`${styles.pill} ${styles.pillPending}`}>Pendente</span>}
        </div>
        {metadata?.startDate && metadata.endDate ? (
          <div className={styles.dateRange}>
            <div>
              <span className={styles.dateLabel}>Check-in</span>
              <span className={styles.dateValue}>{formatDate(metadata.startDate)}</span>
            </div>
            <div>
              <span className={styles.dateLabel}>Check-out</span>
              <span className={styles.dateValue}>{formatDate(metadata.endDate)}</span>
            </div>
          </div>
        ) : (
          <p className={styles.cardMeta}>{message.content}</p>
        )}
        {nights !== null && nights > 0 && (
          <p className={styles.cardMeta}>
            {nights} {nights === 1 ? "noite" : "noites"}
          </p>
        )}
        {isPending && canRespond && metadata?.bookingId && (
          <div className={styles.cardActions}>
            <button
              type="button"
              className={styles.approveButton}
              disabled={busy}
              onClick={() => handleRespond("bookings", metadata.bookingId!, "approve", message.id)}
            >
              Aprovar
            </button>
            <button
              type="button"
              className={styles.rejectButton}
              disabled={busy}
              onClick={() => handleRespond("bookings", metadata.bookingId!, "reject", message.id)}
            >
              Recusar
            </button>
          </div>
        )}
        {isPending && !conversation.canManage && isParticipant && (
          <p className={styles.cardHint}>Aguardando resposta do anunciante.</p>
        )}
      </div>
    );
  }

  const operationType = conversation.property.operationType;

  return (
    <div className={styles.wrapper}>
      <div className={styles.header}>
        <Link href={`/imovel/${conversation.property.id}`} className={styles.propertyLink}>
          {conversation.property.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={conversation.property.image} alt="" className={styles.propertyImage} />
          ) : (
            <span className={styles.propertyImage} />
          )}
          <div className={styles.propertyText}>
            <p className={styles.propertyName}>{conversation.property.name}</p>
            <p className={styles.propertyMeta}>
              {operationType && <span className={styles.operationTag}>{OPERATION_LABEL[operationType]}</span>}
              <span className={styles.propertyPrice}>
                {formatPrice(conversation.property.price)}
                {operationType ? PRICE_SUFFIX[operationType] : ""}
              </span>
            </p>
          </div>
        </Link>

        <div className={styles.headerActions}>
          {isOwner && isParticipant && !isReported && (
            <button type="button" onClick={handleReport} className={styles.iconButton} title="Denunciar conversa">
              <Flag size={16} />
            </button>
          )}
          {isAdmin && (
            <button
              type="button"
              onClick={handleToggleClose}
              className={styles.iconButton}
              title={isClosed ? "Reabrir conversa" : "Encerrar conversa"}
            >
              {isClosed ? <Unlock size={16} /> : <Lock size={16} />}
            </button>
          )}
        </div>
      </div>

      {(canNegotiate || canCloseSale) && (
        <div className={styles.negotiateBar}>
          <span className={styles.negotiateText}>
            {waitingOnOther
              ? "Sua proposta está aguardando resposta."
              : pendingRound
                ? isSale && !conversation.canManage
                  ? "Há uma oferta esperando sua resposta — compre ou recuse no card."
                  : "Há uma proposta esperando sua resposta."
                : isSale && conversation.canManage
                  ? "Ofereça o imóvel ao comprador — use o botão ou digite /venda."
                  : isSale && !conversation.property.acceptsNegotiation
                    ? "Este anúncio não aceita negociação de valor, mas você pode comprar pelo valor anunciado (/comprar)."
                    : isSale
                      ? "Faça uma proposta (/proposta) ou compre pelo valor anunciado (/comprar)."
                      : "Este anúncio aceita negociação. Use o botão ou digite /proposta."}
          </span>
          <div className={styles.negotiateActions}>
            {waitingOnOther ? (
              <button type="button" className={styles.offerButton} disabled>
                <Handshake size={14} />
                Aguardando
              </button>
            ) : pendingRound ? (
              canCounter && (
                <button type="button" onClick={() => openNegotiationModal()} className={styles.offerButton}>
                  <Handshake size={14} />
                  Contrapropor
                </button>
              )
            ) : isSale && conversation.canManage ? (
              <button type="button" onClick={() => openNegotiationModal("sale")} className={styles.offerButton}>
                <Handshake size={14} />
                Oferta de venda
              </button>
            ) : (
              <>
                {canNegotiate && (
                  <button
                    type="button"
                    onClick={() => openNegotiationModal()}
                    className={isSale ? styles.offerButtonSecondary : styles.offerButton}
                  >
                    <Handshake size={14} />
                    {isSale ? "Proposta" : "Fazer proposta"}
                  </button>
                )}
                {isSale && (
                  <button type="button" onClick={() => openNegotiationModal("buy")} className={styles.offerButton}>
                    Quero comprar
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {isReported && <div className={styles.banner}>Esta conversa foi denunciada e está em análise.</div>}
      {socket && !isConnected && (
        <div className={styles.connectionBanner}>
          <WifiOff size={14} />
          Reconectando… as mensagens novas aparecem assim que a conexão voltar.
        </div>
      )}

      <div className={styles.messagesArea}>
        <div className={styles.messages} ref={scrollRef} onScroll={handleScroll}>
          {messages.length === 0 && (
            <div className={styles.emptyConversation}>
              <p className={styles.emptyTitle}>Comece a conversa</p>
              <p className={styles.emptyText}>
                {isParticipant
                  ? `Envie uma mensagem sobre “${conversation.property.name}”.`
                  : "Nenhuma mensagem nesta conversa ainda."}
              </p>
            </div>
          )}

          {messages.map((message, index) => {
            const previous = messages[index - 1];
            const next = messages[index + 1];
            const alignRight = isAuditor
              ? message.senderId === conversation.property.ownerId
              : message.senderId === currentUser.id;
            const newDay =
              !previous || new Date(previous.createdAt).toDateString() !== new Date(message.createdAt).toDateString();
            const isCard = CARD_TYPES.has(message.type);
            const groupedWithPrevious =
              !newDay &&
              !!previous &&
              previous.senderId === message.senderId &&
              !CARD_TYPES.has(previous.type) &&
              !isCard &&
              new Date(message.createdAt).getTime() - new Date(previous.createdAt).getTime() < GROUP_WINDOW_MS;
            const groupedWithNext =
              !!next &&
              next.senderId === message.senderId &&
              !CARD_TYPES.has(next.type) &&
              !isCard &&
              new Date(next.createdAt).toDateString() === new Date(message.createdAt).toDateString() &&
              new Date(next.createdAt).getTime() - new Date(message.createdAt).getTime() < GROUP_WINDOW_MS;

            return (
              <Fragment key={message.clientId ?? message.id}>
                {newDay && (
                  <div className={styles.daySeparator}>
                    <span>{formatDayLabel(message.createdAt)}</span>
                  </div>
                )}
                <div
                  className={[
                    styles.messageRow,
                    alignRight ? styles.messageRowMine : "",
                    groupedWithPrevious ? styles.messageRowGrouped : "",
                  ].join(" ")}
                >
                  {isCard ? (
                    <div className={styles.cardWrapper}>
                      {isAuditor && <p className={styles.senderLabelOutside}>{message.sender.name}</p>}
                      {renderCard(message)}
                      <p className={styles.cardTime}>{formatTime(message.createdAt)}</p>
                    </div>
                  ) : (
                    <div
                      className={[
                        styles.bubble,
                        alignRight ? styles.bubbleMine : "",
                        groupedWithPrevious ? styles.bubbleGroupedTop : "",
                        groupedWithNext ? styles.bubbleGroupedBottom : "",
                        message.localStatus === "failed" ? styles.bubbleFailed : "",
                      ].join(" ")}
                    >
                      {isAuditor && !groupedWithPrevious && <p className={styles.senderLabel}>{message.sender.name}</p>}
                      <p className={styles.content}>{message.content}</p>
                      {!groupedWithNext && (
                        <p className={styles.time}>
                          {message.localStatus === "sending" ? "Enviando…" : formatTime(message.createdAt)}
                        </p>
                      )}
                    </div>
                  )}
                </div>
                {message.localStatus === "failed" && (
                  <div className={styles.failedRow}>
                    <span>Não enviada.</span>
                    <button type="button" onClick={() => retryMessage(message)} className={styles.retryLink}>
                      <RotateCcw size={12} />
                      Tentar de novo
                    </button>
                  </div>
                )}
              </Fragment>
            );
          })}
        </div>

        {showJumpToLatest && (
          <button type="button" className={styles.jumpButton} onClick={jumpToLatest}>
            <ArrowDown size={14} />
            Novas mensagens
          </button>
        )}
      </div>

      {actionError && <p className={styles.sendError}>{actionError}</p>}

      {isClosed ? (
        <p className={styles.closedNotice}>Esta conversa foi encerrada pela administração.</p>
      ) : isAuditor ? (
        <p className={styles.closedNotice}>Você está visualizando no modo auditoria (apenas leitura).</p>
      ) : isParticipant ? (
        <div className={styles.commandMenuWrapper}>
          {showCommandMenu && (
            <div className={styles.commandMenu} role="listbox">
              {matchingCommands.map((command, index) => (
                <button
                  key={command.trigger}
                  type="button"
                  role="option"
                  aria-selected={index === commandMenuIndex}
                  className={`${styles.commandMenuItem} ${index === commandMenuIndex ? styles.commandMenuItemActive : ""}`}
                  onMouseEnter={() => setCommandMenuIndex(index)}
                  onClick={() => handleSelectCommand(command)}
                >
                  <span className={styles.commandMenuTrigger}>
                    {command.trigger}
                    {command.argument && <span className={styles.commandMenuArg}> {command.argument}</span>}
                  </span>
                  <span className={styles.commandMenuLabel}>{command.label}</span>
                  <span className={styles.commandMenuDescription}>{command.description}</span>
                </button>
              ))}
            </div>
          )}
          {proposalDraft && (
            <div className={styles.proposalHint}>
              {proposalDraft.kind === "propose" && proposalDraft.parsed.value === null ? (
                <p className={styles.proposalHintText}>
                  Digite o valor{isSale ? " e, se quiser, a forma de pagamento" : ""} — ex.:{" "}
                  <code>
                    {proposalDraft.command} 450000{isSale ? " financiamento" : ""}
                  </code>
                </p>
              ) : (
                <p className={styles.proposalHintText}>
                  <Handshake size={14} />
                  {proposalDraft.kind === "buy"
                    ? "Compra pelo valor anunciado de"
                    : proposalDraft.kind === "sale"
                      ? `Oferta de venda${proposalDraft.parsed.value === null ? " pelo valor do anúncio" : ""} de`
                      : /^\/contra/i.test(proposalDraft.command) || pendingRound
                        ? "Contraproposta de"
                        : "Proposta de"}{" "}
                  <strong>
                    {formatBRL(
                      proposalDraft.kind === "buy"
                        ? conversation.property.price
                        : proposalDraft.parsed.value ?? conversation.property.price
                    )}
                    {operationType === "MONTHLY_RENT" ? "/mês" : ""}
                  </strong>
                  {isSale && proposalDraft.parsed.paymentMethod && <> · {proposalDraft.parsed.paymentMethod}</>}
                  {operationType !== "DAILY_RENT" && proposalDraft.kind !== "buy" && proposalDraft.parsed.value !== null && (
                    <span className={styles.proposalHintMuted}>
                      {deltaText(proposalDraft.parsed.value, conversation.property.price)}
                    </span>
                  )}
                </p>
              )}
              {proposalDraft.kind === "buy" &&
                proposalDraft.parsed.value !== null &&
                proposalDraft.parsed.value !== conversation.property.price && (
                  <p className={styles.proposalHintError}>
                    /comprar usa o valor anunciado. Para outro valor, use /proposta.
                  </p>
                )}
              {proposalDraft.parsed.unknownMethod && !partialMethod && (
                <p className={styles.proposalHintError}>
                  Forma de pagamento não reconhecida: “{proposalDraft.parsed.unknownMethod}”.
                </p>
              )}
              {isSale && (
                <div className={styles.proposalChips}>
                  {PAYMENT_METHODS.map((method) => (
                    <button
                      key={method}
                      type="button"
                      className={`${styles.proposalChip} ${
                        proposalDraft.parsed.paymentMethod === method ? styles.proposalChipActive : ""
                      }`}
                      onClick={() => fillPaymentMethod(method)}
                    >
                      {method}
                    </button>
                  ))}
                </div>
              )}
              {(proposalDraft.parsed.value !== null || proposalDraft.kind !== "propose") && !proposalDraft.parsed.unknownMethod && (
                <p className={styles.proposalHintMuted}>Enter para enviar · a outra parte tem 48h para responder</p>
              )}
            </div>
          )}
          {sendError && <p className={styles.sendError}>{sendError}</p>}
          <form onSubmit={handleSend} className={styles.inputRow}>
            <div className={styles.inputWrap}>
              <textarea
                ref={inputRef}
                rows={1}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleInputKeyDown}
                placeholder={other ? `Mensagem para ${other.name}` : "Escreva uma mensagem"}
                className={styles.input}
                aria-label="Mensagem"
              />
              {/* Sugestão do autocomplete em cinza logo depois do texto digitado — Tab aceita. */}
              {ghostSuffix && (
                <div className={styles.inputGhost} aria-hidden="true">
                  <span className={styles.inputGhostTyped}>{input}</span>
                  <span className={styles.inputGhostSuggestion}>{ghostSuffix}</span>
                  <kbd className={styles.inputGhostKey}>Tab</kbd>
                </div>
              )}
            </div>
            <button type="submit" className={styles.sendButton} aria-label="Enviar" disabled={!input.trim()}>
              <Send size={17} />
            </button>
          </form>
          <p className={styles.inputHint}>
            Enter envia · Shift+Enter quebra linha
            {conversation.availableCommands.length > 0 && " · digite / para propostas e comandos"}
          </p>
        </div>
      ) : null}

      {negotiationModal && (
        <NegotiationModal
          operationType={conversation.property.operationType}
          listingPrice={conversation.property.price}
          counterTo={negotiationModal.counterTo}
          mode={negotiationModal.mode}
          onClose={() => setNegotiationModal(null)}
          onSubmit={handleSubmitRound}
        />
      )}
    </div>
  );
}
