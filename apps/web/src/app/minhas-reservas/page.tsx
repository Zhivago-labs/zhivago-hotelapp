import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { requireAuth } from "@/lib/session";
import { getApiUrl } from "@/lib/api";
import { GuestBookingItem, type GuestBookingData } from "@/components/dashboard/GuestBookingItem";
import { CalendarRange, ArrowLeft, Search, Building2 } from "lucide-react";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Minhas Reservas — Zhivago",
};

async function getMyBookings(token: string): Promise<GuestBookingData[]> {
  try {
    const res = await fetch(`${getApiUrl()}/users/me/bookings`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

export default async function MinhasReservasPage() {
  const { token, user } = await requireAuth("/minhas-reservas");

  // Contas do tipo Imobiliária / CNPJ acompanham reservas recebidas pelo Dashboard —
  // exceto quando é um admin usando essa conta, mesma exceção aplicada no resto do app.
  if (user.accountType === "AGENCY" && user.role !== "ADMIN") {
    redirect("/dashboard");
  }

  const bookings = await getMyBookings(token);

  return (
    <main className={styles.main}>
      <div className={styles.container}>
        <div className={styles.header}>
          <Link href={user.role === "ADMIN" ? "/imoveis" : "/dashboard"} className={styles.backLink}>
            <ArrowLeft size={18} />
            {user.role === "ADMIN" ? "Voltar aos imóveis" : "Voltar ao Dashboard"}
          </Link>

          <div className={styles.titleRow}>
            <h1 className={styles.title}>
              <CalendarRange size={28} className={styles.titleIcon} />
              Minhas Reservas & Estadias
            </h1>
            <span className={styles.countBadge}>
              {bookings.length} {bookings.length === 1 ? "reserva" : "reservas"}
            </span>
          </div>
          <p className={styles.subtitle}>
            Acompanhe o status das suas solicitações de aluguel por temporada, estadias confirmadas e histórico completo.
          </p>
        </div>

        {bookings.length === 0 ? (
          <div className={styles.emptyCard}>
            <div className={styles.emptyIconCircle}>
              <Building2 size={36} />
            </div>
            <h2 className={styles.emptyTitle}>Nenhuma reserva encontrada</h2>
            <p className={styles.emptyText}>
              Você ainda não realizou nenhuma solicitação de reserva de imóvel. Explore nossas opções de casas e apartamentos para sua próxima viagem!
            </p>
            <Link href="/imoveis" className={styles.exploreButton}>
              <Search size={18} />
              Explorar Imóveis Disponíveis
            </Link>
          </div>
        ) : (
          <div className={styles.bookingsList}>
            {bookings.map((booking) => (
              <GuestBookingItem key={booking.id} booking={booking} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
