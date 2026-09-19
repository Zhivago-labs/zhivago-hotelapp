import type { AdminReview } from "@/lib/admin-api";
import { adminDeleteReviewAction } from "@/lib/actions/admin";
import { ActionForm } from "@/components/ActionForm";
import { ConfirmSubmitButton } from "@/components/dashboard/ConfirmSubmitButton";
import styles from "./AdminListingCard.module.css";

export function AdminReviewCard({ review }: { review: AdminReview }) {
  return (
    <div className={styles.card}>
      <div className={styles.body}>
        <p className={styles.name}>{"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}</p>
        <p className={styles.location}>{review.listing.name}</p>
        <p className={styles.owner}>
          Por: {review.user.name} ({review.user.email})
        </p>
        {review.comment && <p className={styles.location}>&quot;{review.comment}&quot;</p>}

        <div className={styles.actions}>
          <ActionForm action={adminDeleteReviewAction}>
            <input type="hidden" name="id" value={review.id} />
            <ConfirmSubmitButton
              className={styles.deleteButton}
              confirmMessage="Remover esta avaliação definitivamente? Esta ação não pode ser desfeita."
            >
              Excluir
            </ConfirmSubmitButton>
          </ActionForm>
        </div>
      </div>
    </div>
  );
}
