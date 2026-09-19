import type { AdminBooking } from "@/lib/admin-api";
import { forceCancelBookingAction } from "@/lib/actions/admin";
import { ActionForm } from "@/components/ActionForm";
import { ReasonPromptButton } from "./ReasonPromptButton";
import styles from "./AdminListingCard.module.css";

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  PENDING: { label: "Pendente", color: "#f59e0b" },
  CONFIRMED: { label: "Confirmada", color: "#22c55e" },
  CANCELLED: { label: "Cancelada", color: "#9ca3af" },
  REJECTED: { label: "Rejeitada", color: "#ef4444" },
};

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("pt-BR");
}

export function AdminBookingCard({ booking }: { booking: AdminBooking }) {
  const status = STATUS_LABEL[booking.status] ?? { label: booking.status, color: "#9ca3af" };
  const canForceCancel = booking.status === "PENDING" || booking.status === "CONFIRMED";

  return (
    <div className={styles.card}>
      <span className={styles.statusBadge} style={{ background: `${status.color}22`, color: status.color, position: "static" }}>
        <span className={styles.statusDot} style={{ background: status.color }} />
        {status.label}
      </span>

      <div className={styles.body}>
        <p className={styles.name}>{booking.listing.name}</p>
        <p className={styles.owner}>
          Hóspede: {booking.user.name} ({booking.user.email})
        </p>
        <p className={styles.location}>
          {formatDate(booking.startDate)} → {formatDate(booking.endDate)}
        </p>

        {canForceCancel && (
          <div className={styles.actions}>
            <ActionForm action={forceCancelBookingAction}>
              <input type="hidden" name="id" value={booking.id} />
              <input type="hidden" name="reason" value="" />
              <ReasonPromptButton
                label="Cancelar (admin)"
                promptMessage={`Motivo do cancelamento da reserva de "${booking.listing.name}" (mín. 5 caracteres):`}
                className={styles.rejectButton}
              />
            </ActionForm>
          </div>
        )}
      </div>
    </div>
  );
}
