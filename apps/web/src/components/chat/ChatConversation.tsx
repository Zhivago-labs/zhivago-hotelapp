"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Flag, Lock, Unlock, Send, Handshake, CalendarRange } from "lucide-react";
import { useChatSocket } from "./ChatSocketProvider";
import { getPublicApiUrl } from "@/lib/public-api";
import type { ChatMessage, ConversationDetail } from "@/lib/chat-api";
import styles from "./ChatConversation.module.css";

interface ChatConversationProps {
  conversation: ConversationDetail;
  initialMessages: ChatMessage[];
  token: string;
  currentUser: { id: string; role: string; name: string };
}

const OFFER_PAYMENT_METHODS = ["À Vista", "Financiamento", "Parcelado", "Carta de Crédito"];

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
  const [isOfferModalOpen, setIsOfferModalOpen] = useState(false);
  const [offerValue, setOfferValue] = useState("");
  const [offerPaymentMethod, setOfferPaymentMethod] = useState(OFFER_PAYMENT_METHODS[0]);
  const [offerError, setOfferError] = useState<string | null>(null);
  const [isSubmittingOffer, setIsSubmittingOffer] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const isParticipant = conversation.participants.some((p) => p.id === currentUser.id);
  const isAdmin = currentUser.role === "ADMIN";
  const isAuditor = !isParticipant && isAdmin;
  const isOwner = conversation.property.ownerId === currentUser.id;
  const other = conversation.participants.find((p) => p.id !== currentUser.id);
  const canOffer =
    conversation.property.category === "venda" &&
    conversation.property.status !== "SOLD" &&
    !isOwner &&
    isParticipant &&
    !isClosed;

  const markAsRead = () => {
    patchConversation(token, conversation.id, "read").catch(() => {});
  };

  useEffect(() => {
    markAsRead();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

    socket.on("receiveMessage", handleReceive);
    return () => {
      socket.off("receiveMessage", handleReceive);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, conversation.id]);

  const handleSend = (event: React.FormEvent) => {
    event.preventDefault();
    const content = input.trim();
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
  };

  const handleReport = async () => {
    if (!confirm("Denunciar esta conversa para a administração?")) return;
    if (await patchConversation(token, conversation.id, "report")) setIsReported(true);
  };

  const handleToggleClose = async () => {
    const path = isClosed ? "reopen" : "close";
    if (await patchConversation(token, conversation.id, path)) setIsClosed(!isClosed);
  };

  const handleSendOffer = async () => {
    const rawValue = parseFloat(offerValue.replace(/[^0-9,.]/g, "").replace(",", "."));
    if (isNaN(rawValue) || rawValue <= 0) {
      setOfferError("Digite um valor de proposta válido maior que zero.");
      return;
    }

    setIsSubmittingOffer(true);
    setOfferError(null);
    try {
      const res = await fetch(`${getPublicApiUrl()}/listings/${conversation.property.id}/offers`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ value: rawValue, paymentMethod: offerPaymentMethod }),
      });
      if (res.ok) {
        setIsOfferModalOpen(false);
        setOfferValue("");
      } else {
        const data = await res.json().catch(() => null);
        setOfferError(data?.error ?? "Não foi possível enviar a proposta.");
      }
    } catch {
      setOfferError("Não foi possível conectar ao servidor.");
    } finally {
      setIsSubmittingOffer(false);
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
    const isOfferType = message.type === "OFFER_REQUEST" || message.type === "OFFER_APPROVED" || message.type === "OFFER_REJECTED";
    const isBookingType =
      message.type === "BOOKING_REQUEST" || message.type === "BOOKING_APPROVED" || message.type === "BOOKING_REJECTED";

    if (!isOfferType && !isBookingType) {
      return <p className={styles.content}>{message.content}</p>;
    }

    const metadata = message.metadata ? JSON.parse(message.metadata) : null;
    const canRespond = !isAuditor && isOwner && isParticipant;

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
          {canOffer && (
            <button type="button" onClick={() => setIsOfferModalOpen(true)} className={styles.offerButton}>
              <Handshake size={14} />
              Proposta
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
        <form onSubmit={handleSend} className={styles.inputRow}>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={`Mensagem para ${other?.name ?? "..."}`}
            className={styles.input}
          />
          <button type="submit" className={styles.sendButton} aria-label="Enviar">
            <Send size={18} />
          </button>
        </form>
      ) : null}

      {sendError && <p className={styles.sendError}>{sendError}</p>}

      {isOfferModalOpen && (
        <div className={styles.modalOverlay} onClick={() => !isSubmittingOffer && setIsOfferModalOpen(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <p className={styles.modalTitle}>Enviar Proposta de Compra</p>

            <label className={styles.modalLabel} htmlFor="offerValue">
              Valor da proposta (R$)
            </label>
            <input
              id="offerValue"
              type="text"
              inputMode="numeric"
              placeholder="Ex: 350000"
              value={offerValue}
              onChange={(e) => setOfferValue(e.target.value)}
              className={styles.modalInput}
            />

            <p className={styles.modalLabel}>Forma de pagamento</p>
            <div className={styles.methodsRow}>
              {OFFER_PAYMENT_METHODS.map((method) => (
                <button
                  type="button"
                  key={method}
                  onClick={() => setOfferPaymentMethod(method)}
                  className={`${styles.methodBadge} ${offerPaymentMethod === method ? styles.methodBadgeSelected : ""}`}
                >
                  {method}
                </button>
              ))}
            </div>

            {offerError && <p className={styles.sendError}>{offerError}</p>}

            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.modalCancelButton}
                onClick={() => setIsOfferModalOpen(false)}
                disabled={isSubmittingOffer}
              >
                Cancelar
              </button>
              <button
                type="button"
                className={styles.modalSubmitButton}
                onClick={handleSendOffer}
                disabled={isSubmittingOffer}
              >
                {isSubmittingOffer ? "Enviando…" : "Enviar Proposta"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
