"use client";

import { useState } from "react";
import type { ReceivedBooking } from "@/lib/listings-api";
import { cancelBookingAction, approveBookingAction, rejectBookingAction } from "@/lib/actions/listings";
import { ActionForm } from "@/components/ActionForm";
import { ConfirmSubmitButton } from "./ConfirmSubmitButton";
import { BookingDiscountModal } from "./BookingDiscountModal";
import { Calendar, Clock, CheckCircle2, XCircle, User, Building2, Tag } from "lucide-react";
import styles from "./ReceivedBookingItem.module.css";

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

function getDurationLabel(startStr: string, endStr: string): string {
  const start = new Date(startStr);
  const end = new Date(endStr);
  const diffTime = Math.abs(end.getTime() - start.getTime());
  const diffDays = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

  if (diffDays >= 30) {
    const months = Math.round(diffDays / 30);
    return `${months} ${months === 1 ? "mês" : "meses"} (${diffDays} dias)`;
  }
  return `${diffDays} ${diffDays === 1 ? "dia" : "dias"}`;
}

function statusInfo(status: string, isPast: boolean): { label: string; bg: string; text: string; border: string } {
  if (status === "CANCELLED") return { label: "Cancelada", bg: "rgba(239, 68, 68, 0.08)", text: "#ef4444", border: "rgba(239, 68, 68, 0.2)" };
  if (status === "REJECTED") return { label: "Recusada", bg: "rgba(239, 68, 68, 0.08)", text: "#ef4444", border: "rgba(239, 68, 68, 0.2)" };
  if (status === "PENDING") return { label: "Pendente de Aprovação", bg: "rgba(245, 158, 11, 0.08)", text: "#f59e0b", border: "rgba(245, 158, 11, 0.2)" };
  if (isPast) return { label: "Concluída", bg: "rgba(148, 163, 184, 0.08)", text: "#64748b", border: "rgba(148, 163, 184, 0.2)" };
  return { label: "Confirmada", bg: "rgba(34, 197, 94, 0.08)", text: "#22c55e", border: "rgba(34, 197, 94, 0.2)" };
}

export function ReceivedBookingItem({ booking }: { booking: ReceivedBooking }) {
  const [discountModalOpen, setDiscountModalOpen] = useState(false);
  const isPast = new Date(booking.endDate) < new Date();
  const info = statusInfo(booking.status, isPast);
  const canCancel = !isPast && (booking.status === "PENDING" || booking.status === "CONFIRMED");
  const canRespond = !isPast && booking.status === "PENDING";
  const canDiscount = booking.status === "PENDING" || booking.status === "CONFIRMED";
  const hasActiveDiscount = booking.discountedPrice != null && booking.discountedPrice < booking.price;
  const durationText = getDurationLabel(booking.startDate, booking.endDate);

  return (
    <div className={styles.item}>
      <div className={styles.header}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={booking.user.avatar ?? `https://ui-avatars.com/api/?name=${encodeURIComponent(booking.user.name)}&background=f0f0f0`}
          alt={booking.user.name}
          className={styles.avatar}
        />
        <div className={styles.who}>
          <p className={styles.guestName}>
            <User size={14} className={styles.inlineIcon} />
            {booking.user.name}
          </p>
          <p className={styles.listingName}>
            <Building2 size={13} className={styles.inlineIcon} />
            {booking.listing.name}
          </p>
        </div>
        <span
          className={styles.statusBadge}
          style={{ background: info.bg, color: info.text, borderColor: info.border }}
        >
          {info.label}
        </span>
      </div>

      <div className={styles.detailsRow}>
        <div className={styles.dateChip}>
          <Calendar size={14} className={styles.chipIcon} />
          <span>{formatDate(booking.startDate)} — {formatDate(booking.endDate)}</span>
        </div>
        <div className={styles.durationChip}>
          <Clock size={14} className={styles.chipIcon} />
          <span>{durationText}</span>
        </div>
      </div>

      <div className={styles.detailsRow}>
        <div className={styles.dateChip}>
          {hasActiveDiscount ? (
            <>
              <span style={{ textDecoration: "line-through", opacity: 0.6 }}>
                R$ {booking.price.toLocaleString("pt-BR")}
              </span>
              <span> → R$ {booking.discountedPrice!.toLocaleString("pt-BR")}</span>
            </>
          ) : (
            <span>R$ {booking.price.toLocaleString("pt-BR")}</span>
          )}
        </div>
        {canDiscount && (
          <button
            type="button"
            className={styles.durationChip}
            style={{ cursor: "pointer", fontFamily: "inherit" }}
            onClick={() => setDiscountModalOpen(true)}
          >
            <Tag size={14} className={styles.chipIcon} />
            <span>{hasActiveDiscount ? "Gerenciar desconto" : "Aplicar desconto"}</span>
          </button>
        )}
      </div>

      {discountModalOpen && (
        <BookingDiscountModal
          booking={{
            id: booking.id,
            price: booking.price,
            discountedPrice: booking.discountedPrice,
            guestName: booking.user.name,
          }}
          onClose={() => setDiscountModalOpen(false)}
        />
      )}

      {canRespond && (
        <div className={styles.responseRow}>
          <ActionForm action={approveBookingAction}>
            <input type="hidden" name="id" value={booking.id} />
            <button type="submit" className={styles.approveButton}>
              <CheckCircle2 size={15} /> Aprovar Reserva
            </button>
          </ActionForm>
          <ActionForm action={rejectBookingAction}>
            <input type="hidden" name="id" value={booking.id} />
            <button type="submit" className={styles.rejectButton}>
              <XCircle size={15} /> Recusar
            </button>
          </ActionForm>
        </div>
      )}

      {canCancel && (
        <ActionForm action={cancelBookingAction} className={styles.cancelForm}>
          <input type="hidden" name="id" value={booking.id} />
          <ConfirmSubmitButton className={styles.cancelButton} confirmMessage="Cancelar esta reserva do seu imóvel?">
            Cancelar reserva
          </ConfirmSubmitButton>
        </ActionForm>
      )}
    </div>
  );
}
