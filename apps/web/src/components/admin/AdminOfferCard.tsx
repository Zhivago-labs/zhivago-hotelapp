import type { AdminOffer } from "@/lib/admin-api";
import styles from "./AdminListingCard.module.css";

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  PENDING: { label: "Pendente", color: "#f59e0b" },
  ACCEPTED: { label: "Aceita", color: "#22c55e" },
  REJECTED: { label: "Recusada", color: "#ef4444" },
  CANCELLED: { label: "Cancelada", color: "#9ca3af" },
};

function formatPrice(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

export function AdminOfferCard({ offer }: { offer: AdminOffer }) {
  const status = STATUS_LABEL[offer.status] ?? { label: offer.status, color: "#9ca3af" };

  return (
    <div className={styles.card}>
      <span className={styles.statusBadge} style={{ background: `${status.color}22`, color: status.color, position: "static" }}>
        <span className={styles.statusDot} style={{ background: status.color }} />
        {status.label}
      </span>

      <div className={styles.body}>
        <p className={styles.name}>{offer.listing.name}</p>
        <p className={styles.owner}>
          Comprador: {offer.buyer.name} ({offer.buyer.email})
        </p>
        <p className={styles.price}>{formatPrice(offer.value)}</p>
        <p className={styles.location}>Pagamento: {offer.paymentMethod}</p>
      </div>
    </div>
  );
}
