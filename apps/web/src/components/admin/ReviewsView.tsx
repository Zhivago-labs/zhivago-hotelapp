import Link from "next/link";
import { getAdminReviews } from "@/lib/admin-api";
import { AdminReviewCard } from "./AdminReviewCard";
import styles from "@/app/admin/page.module.css";

export async function ReviewsView({ token, page }: { token: string; page: number }) {
  const { reviews, totalPages } = await getAdminReviews(token, page);

  return (
    <>
      {reviews.length === 0 ? (
        <p className={styles.empty}>Nenhuma avaliação encontrada.</p>
      ) : (
        <div className={styles.listingsGrid}>
          {reviews.map((review) => (
            <AdminReviewCard key={review.id} review={review} />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className={styles.pagination}>
          {page <= 1 ? (
            <span className={`${styles.pageLink} ${styles.pageLinkDisabled}`}>← Anterior</span>
          ) : (
            <Link href={`/admin?view=reviews&page=${page - 1}`} className={styles.pageLink}>
              ← Anterior
            </Link>
          )}
          <span className={styles.pageInfo}>
            Página {page} de {totalPages}
          </span>
          {page >= totalPages ? (
            <span className={`${styles.pageLink} ${styles.pageLinkDisabled}`}>Próxima →</span>
          ) : (
            <Link href={`/admin?view=reviews&page=${page + 1}`} className={styles.pageLink}>
              Próxima →
            </Link>
          )}
        </div>
      )}
    </>
  );
}
