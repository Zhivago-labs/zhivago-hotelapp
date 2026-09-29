"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Flag, Lock, Unlock, Send, Handshake, CalendarRange } from "lucide-react";
import type { Negotiation, NegotiationRound } from "@zhivago/shared";
import { useChatSocket } from "./ChatSocketProvider";
import { NegotiationModal, NegotiationRoundCard } from "./NegotiationWidgets";
import { getPublicApiUrl } from "@/lib/public-api";
import type { ChatCommand, ChatMessage, ConversationDetail } from "@/lib/chat-api";
import styles from "./ChatConversation.module.css";

interface ChatConversationProps {
  conversation: ConversationDetail;
  initialMessages: ChatMessage[];
  token: string;
  currentUser: { id: string; role: string; name: string };
}

function upsertNegotiation(list: Negotiation[], next: Negotiation): Negotiation[] {
  return list.some((n) => n.id === next.id) ? list.map((n) => (n.id === next.id ? next : n)) : [...list, next];
}

function formatPrice(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("pt-BR");
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

async function patchRequest(token: string, kind: "bookings" | "offers", id: string, action: "approve" | "reject") {
  const res = await fetch(`${getPublicApiUrl()}/${kind}/${id}/${action}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.ok;
}

export function ChatConversation({ conversation, initialMessages, token, currentUser }: ChatConversationProps) {
  const { socket } = useChatSocket();
  const [messages, setMessages] = useState(initialMessages);
  const [input, setInput] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isClosed, setIsClosed] = useState(conversation.isClosed);
  const [isReported, setIsReported] = useState(conversation.isReported);
  const [negotiations, setNegotiations] = useState<Negotiation[]>([]);
  // null = fechado; { counterTo: null } = proposta nova; com counterTo = contraproposta.
  const [negotiationModal, setNegotiationModal] = useState<{
    counterTo: { negotiation: Negotiation; round: NegotiationRound } | null;
  } | null>(null);
  const [commandMenuIndex, setCommandMenuIndex] = useState(0);
  const [commandMenuDismissed, setCommandMenuDismissed] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

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

  const markAsRead = () => {
    patchConversation(token, conversation.id, "read").catch(() => {});
  };

  useEffect(() => {
    markAsRead();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch(`${getPublicApiUrl()}/conversations/${conversation.id}/negotiations`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((data: Negotiation[]) => {
        if (!cancelled) setNegotiations(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [conversation.id, token]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!socket) return;

    const handleReceive = (message: ChatMessage) => {
      if (message.conversationId !== conversation.id) return;
      setMessages((prev) => [...prev, message]);
      markAsRead();
    };

    // Estado de uma negociação mudou (nova rodada, aceite, recusa, expiração) — atualiza os cards
    // nas duas telas sem recarregar.
    const handleNegotiation = (negotiation: Negotiation) => {
      if (negotiation.conversationId !== conversation.id) return;
      setNegotiations((prev) => upsertNegotiation(prev, negotiation));
    };

    // Card de reserva respondido pelo outro lado.
    const handleMessageUpdated = (update: Pick<ChatMessage, "id" | "type" | "conversationId">) => {
      if (update.conversationId !== conversation.id) return;
      setMessages((prev) => prev.map((m) => (m.id === update.id ? { ...m, type: update.type } : m)));
    };

    socket.on("receiveMessage", handleReceive);
    socket.on("negotiationUpdated", handleNegotiation);
    socket.on("messageUpdated", handleMessageUpdated);
    return () => {
      socket.off("receiveMessage", handleReceive);
      socket.off("negotiationUpdated", handleNegotiation);
      socket.off("messageUpdated", handleMessageUpdated);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, conversation.id]);

  const sendContent = (content: string) => {
    if (!content || !socket || isClosed || !isParticipant) return;

    setSendError(null);
    socket.emit(
      "sendMessage",
      { conversationId: conversation.id, content },
      (response: { error?: string; success?: boolean; message?: ChatMessage }) => {
        if (response.error) {
          setSendError(response.error);
          return;
        }
        if (response.message) {
          setMessages((prev) => [...prev, response.message as ChatMessage]);
        }
      }
    );
    setInput("");
    setCommandMenuDismissed(false);
  };

  const handleSend = (event: React.FormEvent) => {
    event.preventDefault();
    sendContent(input.trim());
  };

  const handleSelectCommand = (command: ChatCommand) => {
    // "/negociar" aceita um valor ("/negociar 450000") — deixa o cursor pronto pra digitá-lo.
    if (command.trigger === "/negociar") {
      setInput("/negociar ");
      setCommandMenuDismissed(true);
      return;
    }
    sendContent(command.trigger);
  };

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setInput(value);
    setCommandMenuIndex(0);
    if (!value.startsWith("/")) setCommandMenuDismissed(false);
  };

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showCommandMenu) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setCommandMenuIndex((i) => (i + 1) % matchingCommands.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setCommandMenuIndex((i) => (i - 1 + matchingCommands.length) % matchingCommands.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      handleSelectCommand(matchingCommands[commandMenuIndex]!);
    } else if (event.key === "Escape") {
      setCommandMenuDismissed(true);
    }
  };

  const handleReport = async () => {
    if (!confirm("Denunciar esta conversa para a administração?")) return;
    if (await patchConversation(token, conversation.id, "report")) setIsReported(true);
  };

  const handleToggleClose = async () => {
    const path = isClosed ? "reopen" : "close";
    if (await patchConversation(token, conversation.id, path)) setIsClosed(!isClosed);
  };

  /** Envia proposta ou contraproposta; devolve a mensagem de erro, ou null se deu certo. */
  const handleSubmitRound = async (value: number, paymentMethod: string | null): Promise<string | null> => {
    try {
      const res = await fetch(`${getPublicApiUrl()}/conversations/${conversation.id}/negotiations/rounds`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ value, paymentMethod }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) return data?.error ?? "Não foi possível enviar a proposta.";
      // A mensagem do card chega pelo socket (receiveMessage); o estado, por negotiationUpdated —
      // aplicado aqui também caso o socket esteja desconectado.
      if (data?.negotiation) setNegotiations((prev) => upsertNegotiation(prev, data.negotiation));
      setNegotiationModal(null);
      return null;
    } catch {
      return "Não foi possível conectar ao servidor.";
    }
  };

  const handleRoundAction = async (roundId: string, action: "accept" | "reject" | "withdraw") => {
    if (action === "accept" && !confirm("Aceitar esta proposta? O valor passa a valer como acordado.")) return;
    setActionError(null);
    try {
      const res = await fetch(`${getPublicApiUrl()}/offers/${roundId}/${action}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setActionError(data?.error ?? "Não foi possível concluir a ação. Tente novamente.");
        return;
      }
      if (data?.id) setNegotiations((prev) => upsertNegotiation(prev, data as Negotiation));
    } catch {
      setActionError("Não foi possível conectar ao servidor.");
    }
  };

  const openNegotiationModal = () => {
    if (pendingRound && openNegotiation && pendingRound.side !== viewerSide) {
      setNegotiationModal({ counterTo: { negotiation: openNegotiation, round: pendingRound } });
    } else {
      setNegotiationModal({ counterTo: null });
    }
  };

  const handleRespond = async (
    kind: "bookings" | "offers",
    id: string,
    action: "approve" | "reject",
    messageId: string
  ) => {
    setActionError(null);
    const ok = await patchRequest(token, kind, id, action);
    if (!ok) {
      setActionError("Não foi possível concluir a ação. Tente novamente.");
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

  function renderMessageBody(message: ChatMessage) {
    if (message.type === "NEGOTIATION_ROUND") {
      let meta: { negotiationId?: string; offerId?: string } = {};
      try {
        meta = message.metadata ? JSON.parse(message.metadata) : {};
      } catch {}
      return (
        <NegotiationRoundCard
          negotiation={negotiations.find((n) => n.id === meta.negotiationId)}
          roundId={meta.offerId ?? ""}
          fallbackContent={message.content}
          viewerId={currentUser.id}
          viewerSide={viewerSide}
          canAct={canActOnNegotiation}
          onAction={handleRoundAction}
          onCounter={(negotiation, round) => setNegotiationModal({ counterTo: { negotiation, round } })}
        />
      );
    }

    const isOfferType = message.type === "OFFER_REQUEST" || message.type === "OFFER_APPROVED" || message.type === "OFFER_REJECTED";
    const isBookingType =
      message.type === "BOOKING_REQUEST" || message.type === "BOOKING_APPROVED" || message.type === "BOOKING_REJECTED";

    if (!isOfferType && !isBookingType) {
      return <p className={styles.content}>{message.content}</p>;
    }

    const metadata = message.metadata ? JSON.parse(message.metadata) : null;
    const canRespond = !isAuditor && conversation.canManage && isParticipant;

    if (isOfferType) {
      return (
        <div className={styles.requestCard}>
          <p className={styles.requestTitle}>
            <Handshake size={14} />
            Proposta de Compra
          </p>
          {metadata && (
            <>
              <p className={styles.requestLine}>Valor: {formatPrice(Number(metadata.value))}</p>
              <p className={styles.requestLine}>Pagamento: {metadata.paymentMethod}</p>
            </>
          )}
          {message.type === "OFFER_APPROVED" && <p className={styles.requestStatusApproved}>✅ Proposta aceita</p>}
          {message.type === "OFFER_REJECTED" && <p className={styles.requestStatusRejected}>❌ Proposta recusada</p>}
          {message.type === "OFFER_REQUEST" && canRespond && metadata && (
            <div className={styles.requestActions}>
              <button
                type="button"
                className={styles.approveButton}
                onClick={() => handleRespond("offers", metadata.offerId, "approve", message.id)}
              >
                Aceitar
              </button>
              <button
                type="button"
                className={styles.rejectButton}
                onClick={() => handleRespond("offers", metadata.offerId, "reject", message.id)}
              >
                Recusar
              </button>
            </div>
          )}
        </div>
      );
    }

    return (
      <div className={styles.requestCard}>
        <p className={styles.requestTitle}>
          <CalendarRange size={14} />
          Solicitação de Reserva
        </p>
        {metadata && (
          <>
            <p className={styles.requestLine}>De: {formatDate(metadata.startDate)}</p>
            <p className={styles.requestLine}>Até: {formatDate(metadata.endDate)}</p>
          </>
        )}
        {message.type === "BOOKING_APPROVED" && <p className={styles.requestStatusApproved}>✅ Reserva aprovada</p>}
        {message.type === "BOOKING_REJECTED" && <p className={styles.requestStatusRejected}>❌ Reserva recusada</p>}
        {message.type === "BOOKING_REQUEST" && canRespond && metadata && (
          <div className={styles.requestActions}>
            <button
              type="button"
              className={styles.approveButton}
              onClick={() => handleRespond("bookings", metadata.bookingId, "approve", message.id)}
            >
              Aprovar
            </button>
            <button
              type="button"
              className={styles.rejectButton}
              onClick={() => handleRespond("bookings", metadata.bookingId, "reject", message.id)}
            >
              Recusar
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.header}>
        <Link href={`/imovel/${conversation.property.id}`} className={styles.propertyLink}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={conversation.property.image} alt={conversation.property.name} className={styles.propertyImage} />
          <div>
            <p className={styles.propertyName}>{conversation.property.name}</p>
            <p className={styles.propertyPrice}>{formatPrice(conversation.property.price)}</p>
          </div>
        </Link>

        <div className={styles.headerActions}>
          {canNegotiate && (
            <button
              type="button"
              onClick={openNegotiationModal}
              className={styles.offerButton}
              disabled={waitingOnOther}
              title={waitingOnOther ? "Aguardando resposta à sua proposta" : undefined}
            >
              <Handshake size={14} />
              {waitingOnOther ? "Aguardando resposta" : pendingRound ? "Contrapropor" : "Negociar valor"}
            </button>
          )}
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

      {isReported && <div className={styles.banner}>Esta conversa foi denunciada e está em análise.</div>}

      <div className={styles.messages}>
        {messages.map((message) => {
          const alignRight = isAuditor
            ? message.senderId === conversation.property.ownerId
            : message.senderId === currentUser.id;

          return (
            <div key={message.id} className={`${styles.messageRow} ${alignRight ? styles.messageRowMine : ""}`}>
              <div className={`${styles.bubble} ${alignRight ? styles.bubbleMine : ""}`}>
                {isAuditor && <p className={styles.senderLabel}>{message.sender.name}</p>}
                {renderMessageBody(message)}
                <p className={styles.time}>{formatTime(message.createdAt)}</p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
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
                  <span className={styles.commandMenuTrigger}>{command.trigger}</span>
                  <span className={styles.commandMenuLabel}>{command.label}</span>
                  <span className={styles.commandMenuDescription}>{command.description}</span>
                </button>
              ))}
            </div>
          )}
          <form onSubmit={handleSend} className={styles.inputRow}>
            <input
              type="text"
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleInputKeyDown}
              placeholder={`Mensagem para ${other?.name ?? "..."}`}
              className={styles.input}
            />
            <button type="submit" className={styles.sendButton} aria-label="Enviar">
              <Send size={18} />
            </button>
          </form>
        </div>
      ) : null}

      {sendError && <p className={styles.sendError}>{sendError}</p>}

      {negotiationModal && (
        <NegotiationModal
          operationType={conversation.property.operationType}
          listingPrice={conversation.property.price}
          counterTo={negotiationModal.counterTo}
          onClose={() => setNegotiationModal(null)}
          onSubmit={handleSubmitRound}
        />
      )}
    </div>
  );
}
