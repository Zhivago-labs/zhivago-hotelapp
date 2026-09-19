import Link from "next/link";
import { getAdminBookings } from "@/lib/admin-api";
import { AdminBookingCard } from "./AdminBookingCard";
import styles from "@/app/admin/page.module.css";

const STATUS_TABS: Array<{ value: string; label: string }> = [
  { value: "PENDING", label: "Pendente" },
  { value: "CONFIRMED", label: "Confirmada" },
  { value: "CANCELLED", label: "Cancelada" },
  { value: "REJECTED", label: "Rejeitada" },
  { value: "ALL", label: "Todas" },
];

export async function BookingsView({ token, status, page }: { token: string; status: string; page: number }) {
  const { bookings, totalPages } = await getAdminBookings(token, status, page);

  return (
    <>
      <div className={styles.filters}>
        {STATUS_TABS.map((tab) => (
          <Link
            key={tab.value}
            href={`/admin?view=bookings&status=${tab.value}`}
            className={`${styles.filterTab} ${status === tab.value ? styles.filterTabActive : ""}`}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {bookings.length === 0 ? (
        <p className={styles.empty}>Nenhuma reserva encontrada para este filtro.</p>
      ) : (
        <div className={styles.listingsGrid}>
          {bookings.map((booking) => (
            <AdminBookingCard key={booking.id} booking={booking} />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className={styles.pagination}>
          {page <= 1 ? (
            <span className={`${styles.pageLink} ${styles.pageLinkDisabled}`}>← Anterior</span>
          ) : (
            <Link href={`/admin?view=bookings&status=${status}&page=${page - 1}`} className={styles.pageLink}>
              ← Anterior
            </Link>
          )}
          <span className={styles.pageInfo}>
            Página {page} de {totalPages}
          </span>
          {page >= totalPages ? (
            <span className={`${styles.pageLink} ${styles.pageLinkDisabled}`}>Próxima →</span>
          ) : (
            <Link href={`/admin?view=bookings&status=${status}&page=${page + 1}`} className={styles.pageLink}>
              Próxima →
            </Link>
          )}
        </div>
      )}
    </>
  );
}
