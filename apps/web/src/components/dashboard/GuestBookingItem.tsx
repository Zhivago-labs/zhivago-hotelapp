"use client";

import { useState } from "react";
import Link from "next/link";
import { Calendar, MapPin, MessageCircle, AlertCircle, CheckCircle2, XCircle, Clock } from "lucide-react";
import { useChatSocket } from "@/components/chat/ChatSocketProvider";
import { getPublicApiUrl } from "@/lib/public-api";
import { useRouter } from "next/navigation";
import styles from "./GuestBookingItem.module.css";

export interface GuestBookingData {
  id: string;
  startDate: string;
  endDate: string;
  status: string;
  createdAt: string;
  // Preço efetivo travado no momento da reserva (já considerando um eventual desconto pontual
  // aplicado pelo anfitrião a esta reserva) — nunca o preço ao vivo do anúncio.
  price?: number;
  listing: {
    id: string;
    name: string;
    location: string;
    price: number;
    image: string | null;
  };
}

function formatDateBR(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function calculateNights(startStr: string, endStr: string): number {
  const start = new Date(startStr);
  const end = new Date(endStr);
  const diffTime = Math.abs(end.getTime() - start.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return Math.max(1, diffDays);
}

export function GuestBookingItem({ booking }: { booking: GuestBookingData }) {
  const router = useRouter();
  const { token, openSidebar } = useChatSocket();
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nights = calculateNights(booking.startDate, booking.endDate);
  const unitPrice = booking.price ?? booking.listing.price;
  const totalPrice = unitPrice * nights;

  const handleCancel = async () => {
    if (!token) return;
    if (!confirm("Tem certeza que deseja cancelar esta solicitação de reserva?")) return;

    setCancelling(true);
    setError(null);

    try {
      const res = await fetch(`${getPublicApiUrl()}/bookings/${booking.id}/cancel`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? data?.message ?? "Não foi possível cancelar a reserva.");
        return;
      }

      router.refresh();
    } catch {
      setError("Erro ao se conectar com o servidor.");
    } finally {
      setCancelling(false);
    }
  };

  const renderStatusBadge = () => {
    switch (booking.status) {
      case "CONFIRMED":
      case "APPROVED":
        return (
          <span className={`${styles.statusBadge} ${styles.badgeConfirmed}`}>
            <CheckCircle2 size={14} />
            Reserva Confirmada
          </span>
        );
      case "PENDING":
        return (
          <span className={`${styles.statusBadge} ${styles.badgePending}`}>
            <Clock size={14} />
            Aguardando Anfitrião
          </span>
        );
      case "REJECTED":
        return (
          <span className={`${styles.statusBadge} ${styles.badgeRejected}`}>
            <XCircle size={14} />
            Recusada pelo Anfitrião
          </span>
        );
      case "CANCELLED":
        return (
          <span className={`${styles.statusBadge} ${styles.badgeCancelled}`}>
            <XCircle size={14} />
            Reserva Cancelada
          </span>
        );
      default:
        return (
          <span className={styles.statusBadge}>
            {booking.status}
          </span>
        );
    }
  };

  return (
    <div className={styles.card}>
      <div className={styles.imageContainer}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={booking.listing.image || "https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=800"}
          alt={booking.listing.name}
          className={styles.image}
        />
      </div>

      <div className={styles.content}>
        <div className={styles.headerRow}>
          <div>
            <Link href={`/imovel/${booking.listing.id}`} className={styles.listingTitle}>
              {booking.listing.name}
            </Link>
            <p className={styles.location}>
              <MapPin size={14} />
              {booking.listing.location}
            </p>
          </div>
          {renderStatusBadge()}
        </div>

        <div className={styles.detailsGrid}>
          <div className={styles.detailBox}>
            <span className={styles.detailLabel}>
              <Calendar size={14} /> Período da Estadia
            </span>
            <span className={styles.detailValue}>
              {formatDateBR(booking.startDate)} a {formatDateBR(booking.endDate)} ({nights} {nights === 1 ? "noite" : "noites"})
            </span>
          </div>

          <div className={styles.detailBox}>
            <span className={styles.detailLabel}>Valor Estimado</span>
            <span className={styles.detailValueHighlight}>
              R$ {totalPrice.toLocaleString("pt-BR")}
              <span className={styles.pricePerNight}> (R$ {unitPrice.toLocaleString("pt-BR")}/noite)</span>
            </span>
          </div>
        </div>

        {error && (
          <div className={styles.errorAlert}>
            <AlertCircle size={14} />
            <span>{error}</span>
          </div>
        )}

        <div className={styles.actionsRow}>
          <button
            type="button"
            onClick={() => openSidebar()}
            className={styles.chatButton}
          >
            <MessageCircle size={16} />
            Mensagens / Chat
          </button>

          {(booking.status === "PENDING" || booking.status === "CONFIRMED" || booking.status === "APPROVED") && (
            <button
              type="button"
              onClick={handleCancel}
              disabled={cancelling}
              className={styles.cancelButton}
            >
              {cancelling ? "Cancelando…" : "Cancelar Reserva"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
