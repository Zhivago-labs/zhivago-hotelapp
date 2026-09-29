"use client";

import { useState } from "react";
import { Handshake } from "lucide-react";
import type { Negotiation, NegotiationRound, NegotiationSide, ListingOperationType } from "@zhivago/shared";
import styles from "./ChatConversation.module.css";

// Negociação de valor no chat — card de cada rodada e modal de proposta/contraproposta. As regras
// (quem pode responder, expiração, efeito do aceite) vivem no backend (lib/negotiations.ts); aqui
// só se decide o que mostrar a partir do estado que ele devolve.

export const PAYMENT_METHODS = ["À Vista", "Financiamento", "Parcelado", "Carta de Crédito"];

const VALUE_LABEL: Record<ListingOperationType, string> = {
  SALE: "Valor total (R$)",
  MONTHLY_RENT: "Aluguel mensal (R$)",
  DAILY_RENT: "Valor total da reserva (R$)",
};

const STATUS_LABEL: Record<string, { text: string; tone: "ok" | "bad" | "muted" }> = {
  ACCEPTED: { text: "✅ Proposta aceita", tone: "ok" },
  REJECTED: { text: "❌ Proposta recusada", tone: "bad" },
  COUNTERED: { text: "↪ Respondida com contraproposta", tone: "muted" },
  WITHDRAWN: { text: "↩ Proposta retirada", tone: "muted" },
  EXPIRED: { text: "⌛ Proposta expirada", tone: "muted" },
  CANCELLED: { text: "Proposta cancelada", tone: "muted" },
};

export function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/** Mesma leitura do backend (parseMoneyInput em socket.ts): "450.000", "1.250,50", "450000". */
export function parseMoneyInput(raw: string): number | null {
  const cleaned = raw.replace(/[^\d,.]/g, "");
  if (!cleaned) return null;
  let normalized: string;
  if (cleaned.includes(",")) normalized = cleaned.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(cleaned)) normalized = cleaned.replace(/\./g, "");
  else normalized = cleaned;
  const value = Number(normalized);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function deltaText(value: number, reference: number): string | null {
  if (!reference) return null;
  const pct = ((value - reference) / reference) * 100;
  if (Math.abs(pct) < 0.05) return "igual ao anúncio";
  return `${pct > 0 ? "+" : "−"}${Math.abs(pct).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% vs. anúncio`;
}

const unitSuffix = (round: NegotiationRound) => (round.unit === "MONTHLY" ? "/mês" : "");

interface RoundCardProps {
  negotiation: Negotiation | undefined;
  roundId: string;
  fallbackContent: string;
  viewerId: string;
  viewerSide: NegotiationSide;
  canAct: boolean;
  onAction: (roundId: string, action: "accept" | "reject" | "withdraw") => Promise<void>;
  onCounter: (negotiation: Negotiation, round: NegotiationRound) => void;
}

export function NegotiationRoundCard({
  negotiation,
  roundId,
  fallbackContent,
  viewerId,
  viewerSide,
  canAct,
  onAction,
  onCounter,
}: RoundCardProps) {
  const [busy, setBusy] = useState(false);
  const round = negotiation?.rounds.find((r) => r.id === roundId);

  if (!negotiation || !round) {
    return (
      <div className={styles.requestCard}>
        <p className={styles.requestTitle}>
          <Handshake size={14} />
          Negociação
        </p>
        <p className={styles.requestLine}>{fallbackContent}</p>
      </div>
    );
  }

  const isLatest = negotiation.rounds.at(-1)?.id === round.id;
  const isPending = round.status === "PENDING";
  const fromOtherSide = round.side !== viewerSide;
  const delta = deltaText(round.value, negotiation.referencePrice);
  const status = STATUS_LABEL[round.status];

  const run = async (action: "accept" | "reject" | "withdraw") => {
    setBusy(true);
    try {
      await onAction(round.id, action);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.requestCard}>
      <p className={styles.requestTitle}>
        <Handshake size={14} />
        {round.previousOfferId ? "Contraproposta" : "Proposta de valor"}
      </p>
      <p className={styles.negotiationValue}>
        {formatBRL(round.value)}
        {unitSuffix(round)}
      </p>
      <p className={styles.negotiationMeta}>
        Anúncio: {formatBRL(negotiation.referencePrice)}
        {unitSuffix(round)}
        {delta && ` · ${delta}`}
      </p>
      {round.paymentMethod && <p className={styles.negotiationMeta}>Pagamento: {round.paymentMethod}</p>}
      <p className={styles.negotiationMeta}>
        Por {round.proposedById === viewerId ? "você" : round.proposedByName}
      </p>

      {isPending && round.expiresAt && (
        <p className={styles.negotiationMeta}>
          {fromOtherSide ? "Responda até" : "Aguardando resposta até"} {formatDateTime(round.expiresAt)}
        </p>
      )}
      {status && (
        <p
          className={
            status.tone === "ok"
              ? styles.requestStatusApproved
              : status.tone === "bad"
                ? styles.requestStatusRejected
                : styles.negotiationStatusMuted
          }
        >
          {status.text}
        </p>
      )}

      {isPending && canAct && fromOtherSide && (
        <div className={styles.requestActions}>
          <button type="button" className={styles.approveButton} disabled={busy} onClick={() => run("accept")}>
            Aceitar
          </button>
          <button type="button" className={styles.rejectButton} disabled={busy} onClick={() => run("reject")}>
            Recusar
          </button>
          <button
            type="button"
            className={styles.counterButton}
            disabled={busy}
            onClick={() => onCounter(negotiation, round)}
          >
            Contrapropor
          </button>
        </div>
      )}
      {isPending && canAct && !fromOtherSide && (
        <div className={styles.requestActions}>
          <button type="button" className={styles.counterButton} disabled={busy} onClick={() => run("withdraw")}>
            Retirar proposta
          </button>
        </div>
      )}

      {isLatest && negotiation.rounds.length > 1 && (
        <details className={styles.negotiationHistory}>
          <summary>Histórico ({negotiation.rounds.length} rodadas)</summary>
          <ol>
            {negotiation.rounds.map((r) => (
              <li key={r.id}>
                {formatBRL(r.value)}
                {unitSuffix(r)} · {r.proposedById === viewerId ? "você" : r.proposedByName}
                {r.status !== "PENDING" && ` · ${STATUS_LABEL[r.status]?.text.replace(/^\S+\s/, "") ?? r.status}`}
              </li>
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}

interface ModalProps {
  operationType: ListingOperationType;
  listingPrice: number;
  counterTo: { negotiation: Negotiation; round: NegotiationRound } | null;
  onClose: () => void;
  onSubmit: (value: number, paymentMethod: string | null) => Promise<string | null>;
}

export function NegotiationModal({ operationType, listingPrice, counterTo, onClose, onSubmit }: ModalProps) {
  const [rawValue, setRawValue] = useState("");
  const [paymentMethod, setPaymentMethod] = useState(counterTo?.round.paymentMethod ?? PAYMENT_METHODS[0]!);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Na diária a referência é o total da reserva, que só o backend conhece antes da 1ª rodada.
  const reference = counterTo?.negotiation.referencePrice ?? (operationType === "DAILY_RENT" ? null : listingPrice);
  const parsed = parseMoneyInput(rawValue);
  const delta = parsed !== null && reference ? deltaText(parsed, reference) : null;

  const submit = async () => {
    if (parsed === null) {
      setError("Digite um valor válido maior que zero.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const failure = await onSubmit(parsed, operationType === "SALE" ? paymentMethod : null);
    setSubmitting(false);
    if (failure) setError(failure);
  };

  return (
    <div className={styles.modalOverlay} onClick={() => !submitting && onClose()}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <p className={styles.modalTitle}>{counterTo ? "Enviar contraproposta" : "Negociar valor"}</p>

        {counterTo && (
          <p className={styles.modalHint}>
            Proposta atual: {formatBRL(counterTo.round.value)}
            {unitSuffix(counterTo.round)}
          </p>
        )}
        {reference !== null ? (
          <p className={styles.modalHint}>Valor do anúncio: {formatBRL(reference)}</p>
        ) : (
          <p className={styles.modalHint}>O valor proposto é o total da sua reserva pendente.</p>
        )}

        <label className={styles.modalLabel} htmlFor="negotiationValue">
          {VALUE_LABEL[operationType]}
        </label>
        <input
          id="negotiationValue"
          type="text"
          inputMode="decimal"
          placeholder="Ex: 350.000"
          value={rawValue}
          onChange={(e) => setRawValue(e.target.value)}
          className={styles.modalInput}
          autoFocus
        />
        {delta && <p className={styles.modalHint}>{delta}</p>}

        {operationType === "SALE" && (
          <>
            <p className={styles.modalLabel}>Forma de pagamento</p>
            <div className={styles.methodsRow}>
              {PAYMENT_METHODS.map((method) => (
                <button
                  type="button"
                  key={method}
                  onClick={() => setPaymentMethod(method)}
                  className={`${styles.methodBadge} ${paymentMethod === method ? styles.methodBadgeSelected : ""}`}
                >
                  {method}
                </button>
              ))}
            </div>
          </>
        )}

        <p className={styles.modalHint}>A outra parte tem 48h para responder.</p>
        {error && <p className={styles.sendError}>{error}</p>}

        <div className={styles.modalActions}>
          <button type="button" className={styles.modalCancelButton} onClick={onClose} disabled={submitting}>
            Cancelar
          </button>
          <button type="button" className={styles.modalSubmitButton} onClick={submit} disabled={submitting}>
            {submitting ? "Enviando…" : counterTo ? "Enviar contraproposta" : "Enviar proposta"}
          </button>
        </div>
      </div>
    </div>
  );
}
