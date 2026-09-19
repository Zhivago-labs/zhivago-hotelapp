"use client";

import { useState } from "react";
import { CalendarRange, MessageCircle, Lock } from "lucide-react";
import { useChatSocket } from "@/components/chat/ChatSocketProvider";
import { RentalBookingCalendar } from "./RentalBookingCalendar";
import { getPublicApiUrl } from "@/lib/public-api";
import { useRouter } from "next/navigation";
import styles from "./BookingRequestForm.module.css";

function formatDateBR(dateStr: string): string {
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

export function BookingRequestForm({ listingId }: { listingId: string }) {
  const router = useRouter();
  const { token, openSidebar } = useChatSocket();
  const [startDate, setStartDate] = useState<string | null>(null);
  const [endDate, setEndDate] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isPeriodValid = Boolean(startDate && (endDate || startDate));

  const handleSelectPeriod = (start: string | null, end: string | null) => {
    setStartDate(start);
    setEndDate(end);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) {
      router.push(`/login?next=/imovel/${listingId}`);
      return;
    }
    if (!startDate) {
      setError("Selecione a data no calendário.");
      return;
    }

    const effectiveEnd = endDate || startDate;

    setPending(true);
    setError(null);

    try {
      const res = await fetch(`${getPublicApiUrl()}/listings/${listingId}/bookings`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          startDate: new Date(startDate).toISOString(),
          endDate: new Date(effectiveEnd).toISOString(),
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setError(data?.error ?? data?.message ?? "Não foi possível solicitar a reserva.");
        return;
      }

      if (data?.conversationId) {
        openSidebar(data.conversationId);
      }
    } catch {
      setError("Não foi possível conectar ao servidor. Tente novamente.");
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className={styles.form}>
      <p className={styles.title}>
        <CalendarRange size={16} />
        Calendário & Reserva
      </p>

      {/* Calendário com Dias Ocupados */}
      <RentalBookingCalendar
        listingId={listingId}
        startDate={startDate}
        endDate={endDate}
        onSelectPeriod={handleSelectPeriod}
      />

      {startDate && (
        <div className={styles.selectedPeriodBox}>
          <span className={styles.periodLabel}>Período selecionado:</span>
          <span className={styles.periodDates}>
            {formatDateBR(startDate)}
            {endDate && endDate !== startDate ? ` até ${formatDateBR(endDate)}` : " (1 dia)"}
          </span>
        </div>
      )}

      {error && <p className={styles.error}>{error}</p>}

      {/* O Chat só é liberado após a escolha da data */}
      <button
        type="submit"
        className={`${styles.button} ${!isPeriodValid ? styles.buttonDisabled : ""}`}
        disabled={pending || !isPeriodValid}
      >
        {!isPeriodValid ? (
          <>
            <Lock size={16} />
            Selecione as datas para liberar o Chat
          </>
        ) : pending ? (
          "Enviando solicitação…"
        ) : (
          <>
            <MessageCircle size={18} />
            Reservar & Abrir Chat
          </>
        )}
      </button>
    </form>
  );
}
