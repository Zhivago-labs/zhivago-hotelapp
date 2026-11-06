"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import styles from "./Pagination.module.css";

/**
 * Páginas a mostrar, no formato da busca do Airbnb: até 7 páginas aparecem todas; acima disso,
 * sempre a primeira e a última, a atual com as vizinhas, e "…" no lugar do resto.
 *   1 2 3 4 5 … 15  |  1 … 6 7 8 … 15  |  1 … 11 12 13 14 15
 */
export function getPageItems(current: number, total: number): (number | "ellipsis")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, "ellipsis", total];
  if (current >= total - 3) return [1, "ellipsis", total - 4, total - 3, total - 2, total - 1, total];
  return [1, "ellipsis", current - 1, current, current + 1, "ellipsis", total];
}

export function Pagination({
  page,
  totalPages,
  totalItems,
  pageSize,
  itemLabel,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  // Plural usado no resumo ("1 – 24 de 80 imóveis").
  itemLabel: string;
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;

  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, totalItems);

  return (
    <nav className={styles.pagination} aria-label="Paginação">
      <div className={styles.pages}>
        <button
          type="button"
          className={styles.arrow}
          onClick={() => onPageChange(page - 1)}
          disabled={page === 1}
          aria-label="Página anterior"
        >
          <ChevronLeft size={18} />
        </button>

        {getPageItems(page, totalPages).map((item, index) =>
          item === "ellipsis" ? (
            <span key={`ellipsis-${index}`} className={styles.ellipsis} aria-hidden="true">
              …
            </span>
          ) : (
            <button
              key={item}
              type="button"
              className={`${styles.page} ${item === page ? styles.pageActive : ""}`}
              onClick={() => onPageChange(item)}
              aria-label={`Página ${item}`}
              aria-current={item === page ? "page" : undefined}
            >
              {item}
            </button>
          )
        )}

        <button
          type="button"
          className={styles.arrow}
          onClick={() => onPageChange(page + 1)}
          disabled={page === totalPages}
          aria-label="Próxima página"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      <p className={styles.summary}>
        {first} – {last} de {totalItems} {itemLabel}
      </p>
    </nav>
  );
}
