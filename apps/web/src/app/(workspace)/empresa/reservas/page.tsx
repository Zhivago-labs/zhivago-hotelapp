import Link from "next/link";
import { requireWorkspace, workspaceFetch } from "@/lib/workspace";
import type { ReceivedBookingsPage } from "@/lib/listings-api";
import { ReceivedBookingItem } from "@/components/dashboard/ReceivedBookingItem";
import styles from "@/components/workspace/Workspace.module.css";
export const metadata = { title: "Reservas e temporada" };
export default async function Reservations({ searchParams }: { searchParams: Promise<{ search?: string; page?: string }> }) {
  const { token, membership } = await requireWorkspace("/empresa/reservas");
  const params = await searchParams;
  const page = Math.max(1, Math.floor(Number(params.page) || 1));
  const query = new URLSearchParams({ page: String(page), search: params.search?.slice(0,120) || "" });
  const data = await workspaceFetch<ReceivedBookingsPage>(token, `/organizations/bookings?${query}`);
  const href = (page: number) => `/empresa/reservas?${new URLSearchParams({ page: String(page), search: params.search || "" })}`;
  return <main className={styles.page}><h1>Reservas / Temporada</h1><p className={styles.muted}>Reservas dos imóveis de temporada da imobiliária, conforme seu acesso. Os valores são os acordados na reserva; não representam receita recebida.</p><form className={styles.filters}><input name="search" aria-label="Buscar hóspede ou imóvel" placeholder="Hóspede ou imóvel" defaultValue={params.search || ""} /><button>Buscar</button></form><p className={styles.muted}>{data.total} reservas encontradas</p>{data.bookings.length ? data.bookings.map(booking => <ReceivedBookingItem key={booking.id} booking={booking} readOnly={membership.role === "ASSISTANT"} />) : <p className={styles.empty}>Nenhuma reserva de temporada encontrada.</p>}<nav className={styles.pagination} aria-label="Páginas de reservas">{page > 1 && <Link href={href(page - 1)}>Anterior</Link>}<span>Página {page} de {data.totalPages}</span>{page < data.totalPages && <Link href={href(page + 1)}>Próxima</Link>}</nav></main>;
}
