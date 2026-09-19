import Link from "next/link";
import { getAdminOffers } from "@/lib/admin-api";
import { AdminOfferCard } from "./AdminOfferCard";
import styles from "@/app/admin/page.module.css";

const STATUS_TABS: Array<{ value: string; label: string }> = [
  { value: "PENDING", label: "Pendente" },
  { value: "ACCEPTED", label: "Aceita" },
  { value: "REJECTED", label: "Recusada" },
  { value: "CANCELLED", label: "Cancelada" },
  { value: "ALL", label: "Todas" },
];

export async function OffersView({ token, status, page }: { token: string; status: string; page: number }) {
  const { offers, totalPages } = await getAdminOffers(token, status, page);

  return (
    <>
      <div className={styles.filters}>
        {STATUS_TABS.map((tab) => (
          <Link
            key={tab.value}
            href={`/admin?view=offers&status=${tab.value}`}
            className={`${styles.filterTab} ${status === tab.value ? styles.filterTabActive : ""}`}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {offers.length === 0 ? (
        <p className={styles.empty}>Nenhuma proposta encontrada para este filtro.</p>
      ) : (
        <div className={styles.listingsGrid}>
          {offers.map((offer) => (
            <AdminOfferCard key={offer.id} offer={offer} />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className={styles.pagination}>
          {page <= 1 ? (
            <span className={`${styles.pageLink} ${styles.pageLinkDisabled}`}>← Anterior</span>
          ) : (
            <Link href={`/admin?view=offers&status=${status}&page=${page - 1}`} className={styles.pageLink}>
              ← Anterior
            </Link>
          )}
          <span className={styles.pageInfo}>
            Página {page} de {totalPages}
          </span>
          {page >= totalPages ? (
            <span className={`${styles.pageLink} ${styles.pageLinkDisabled}`}>Próxima →</span>
          ) : (
            <Link href={`/admin?view=offers&status=${status}&page=${page + 1}`} className={styles.pageLink}>
              Próxima →
            </Link>
          )}
        </div>
      )}
    </>
  );
}
