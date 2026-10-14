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

const STATUS_LABEL: Record<string, { text: string; pill: string; tone: "ok" | "bad" | "muted" }> = {
  ACCEPTED: { text: "✅ Proposta aceita", pill: "Aceita", tone: "ok" },
  REJECTED: { text: "❌ Proposta recusada", pill: "Recusada", tone: "bad" },
  COUNTERED: { text: "↪ Respondida com contraproposta", pill: "Contraproposta", tone: "muted" },
  WITHDRAWN: { text: "↩ Proposta retirada", pill: "Retirada", tone: "muted" },
  EXPIRED: { text: "⌛ Proposta expirada", pill: "Expirada", tone: "muted" },
  CANCELLED: { text: "Proposta cancelada", pill: "Cancelada", tone: "muted" },
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

// Mesma leitura do backend (parseProposalArgument em socket.ts) — "/proposta 450000 financiamento".
const PAYMENT_METHOD_PATTERNS: { label: string; pattern: RegExp }[] = [
  { label: "À Vista", pattern: /^(a|à)?\s*vista$|^avista$|^pix$|^dinheiro$/ },
  { label: "Financiamento", pattern: /^financ/ },
  { label: "Parcelado", pattern: /^parcel/ },
  { label: "Carta de Crédito", pattern: /^carta/ },
];

export function parseProposalArgument(raw: string): {
  value: number | null;
  valueText: string;
  paymentMethod: string | null;
  unknownMethod: string | null;
} {
  const match = raw.match(/\d[\d.,]*/);
  const value = match ? parseMoneyInput(match[0]) : null;
  const rest = (match ? raw.replace(match[0], " ") : raw)
    .replace(/r\$/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/^(via|no|na|em|com|,|-)\s+/, "");
  const method = rest ? PAYMENT_METHOD_PATTERNS.find((m) => m.pattern.test(rest)) : undefined;
  return {
    value,
    valueText: match?.[0] ?? "",
    paymentMethod: method?.label ?? null,
    unknownMethod: rest && !method ? rest : null,
  };
}

export function deltaText(value: number, reference: number): string | null {
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
  // Contraproposta só quando o anúncio aceita negociação (ou o viewer é o anunciante) — na venda
  // sem negociação o comprador só pode comprar ou recusar a oferta.
  canCounter?: boolean;
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
  canCounter = true,
  onAction,
  onCounter,
}: RoundCardProps) {
  const [busy, setBusy] = useState(false);
  const round = negotiation?.rounds.find((r) => r.id === roundId);

  if (!negotiation || !round) {
    return (
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <span className={styles.cardIcon}>
            <Handshake size={15} />
          </span>
          <span className={styles.cardTitle}>Negociação</span>
        </div>
        <p className={styles.cardMeta}>{fallbackContent}</p>
      </div>
    );
  }

  const isLatest = negotiation.rounds.at(-1)?.id === round.id;
  const isPending = round.status === "PENDING";
  const fromOtherSide = round.side !== viewerSide;
  const delta = deltaText(round.value, negotiation.referencePrice);
  const status = STATUS_LABEL[round.status];
  const pillClass = isPending
    ? styles.pillPending
    : status?.tone === "ok"
      ? styles.pillOk
      : status?.tone === "bad"
        ? styles.pillBad
        : styles.pillMuted;

  // Venda: a 1ª oferta do anunciante é uma "Oferta de venda" e, pro comprador, aceitar = comprar.
  const isSale = negotiation.operationType === "SALE";
  const title = round.previousOfferId
    ? "Contraproposta"
    : isSale && round.side === "LISTING"
      ? "Oferta de venda"
      : isSale && round.value === negotiation.referencePrice
        ? "Compra pelo valor anunciado"
        : "Proposta de valor";
  const acceptLabel = isSale && viewerSide === "CUSTOMER" ? "Comprar" : "Aceitar";

  const run = async (action: "accept" | "reject" | "withdraw") => {
    setBusy(true);
    try {
      await onAction(round.id, action);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <span className={styles.cardIcon}>
          <Handshake size={15} />
        </span>
        <span className={styles.cardTitle}>{title}</span>
        <span className={`${styles.pill} ${pillClass}`}>{isPending ? "Pendente" : status?.pill ?? round.status}</span>
      </div>
      <p className={styles.cardValue}>
        {formatBRL(round.value)}
        {unitSuffix(round)}
      </p>
      <p className={styles.cardMeta}>
        Anúncio: {formatBRL(negotiation.referencePrice)}
        {unitSuffix(round)}
        {delta && ` · ${delta}`}
      </p>
      {round.paymentMethod && <p className={styles.cardMeta}>Pagamento: {round.paymentMethod}</p>}
      <p className={styles.cardMeta}>Por {round.proposedById === viewerId ? "você" : round.proposedByName}</p>

      {isPending && round.expiresAt && (
        <p className={styles.cardHint}>
          {fromOtherSide ? "Responda até" : "Aguardando resposta até"} {formatDateTime(round.expiresAt)}
        </p>
      )}

      {isPending && canAct && fromOtherSide && (
        <div className={styles.cardActions}>
          <button type="button" className={styles.approveButton} disabled={busy} onClick={() => run("accept")}>
            {acceptLabel}
          </button>
          <button type="button" className={styles.rejectButton} disabled={busy} onClick={() => run("reject")}>
            Recusar
          </button>
          {canCounter && (
            <button
              type="button"
              className={styles.counterButton}
              disabled={busy}
              onClick={() => onCounter(negotiation, round)}
            >
              Contrapropor
            </button>
          )}
        </div>
      )}
      {isPending && canAct && !fromOtherSide && (
        <div className={styles.cardActions}>
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

/**
 * - `propose`: proposta nova (ou contraproposta, com `counterTo`);
 * - `sale`: oferta de venda do anunciante — valor do anúncio já preenchido, editável;
 * - `buy`: comprador fecha pelo valor anunciado — valor fixo, só escolhe a forma de pagamento.
 */
export type NegotiationModalMode = "propose" | "sale" | "buy";

const MODAL_TEXT: Record<NegotiationModalMode, { title: string; submit: string }> = {
  propose: { title: "Negociar valor", submit: "Enviar proposta" },
  sale: { title: "Oferta de venda", submit: "Enviar oferta" },
  buy: { title: "Comprar pelo valor anunciado", submit: "Confirmar compra" },
};

interface ModalProps {
  operationType: ListingOperationType;
  listingPrice: number;
  counterTo: { negotiation: Negotiation; round: NegotiationRound } | null;
  mode?: NegotiationModalMode;
  onClose: () => void;
  onSubmit: (value: number, paymentMethod: string | null) => Promise<string | null>;
}

export function NegotiationModal({
  operationType,
  listingPrice,
  counterTo,
  mode = "propose",
  onClose,
  onSubmit,
}: ModalProps) {
  const [rawValue, setRawValue] = useState(
    mode === "sale" ? listingPrice.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : ""
  );
  const [paymentMethod, setPaymentMethod] = useState(counterTo?.round.paymentMethod ?? PAYMENT_METHODS[0]!);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const text = counterTo ? { title: "Enviar contraproposta", submit: "Enviar contraproposta" } : MODAL_TEXT[mode];

  // Na diária a referência é o total da reserva, que só o backend conhece antes da 1ª rodada.
  const reference = counterTo?.negotiation.referencePrice ?? (operationType === "DAILY_RENT" ? null : listingPrice);
  const parsed = mode === "buy" ? listingPrice : parseMoneyInput(rawValue);
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
        <p className={styles.modalTitle}>{text.title}</p>

        {counterTo && (
          <p className={styles.modalHint}>
            Proposta atual: {formatBRL(counterTo.round.value)}
            {unitSuffix(counterTo.round)}
          </p>
        )}

        {mode === "buy" ? (
          <>
            <p className={styles.modalLabel}>Valor anunciado</p>
            <p className={styles.modalFixedValue}>{formatBRL(listingPrice)}</p>
            <p className={styles.modalHint}>
              Você confirma o interesse em comprar por esse valor. O anunciante tem 48h para aceitar — se aceitar, o
              imóvel é marcado como vendido.
            </p>
          </>
        ) : (
          <>
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
          </>
        )}

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

        {mode !== "buy" && <p className={styles.modalHint}>A outra parte tem 48h para responder.</p>}
        {error && <p className={styles.sendError}>{error}</p>}

        <div className={styles.modalActions}>
          <button type="button" className={styles.modalCancelButton} onClick={onClose} disabled={submitting}>
            Cancelar
          </button>
          <button type="button" className={styles.modalSubmitButton} onClick={submit} disabled={submitting}>
            {submitting ? "Enviando…" : text.submit}
          </button>
        </div>
      </div>
    </div>
  );
}
