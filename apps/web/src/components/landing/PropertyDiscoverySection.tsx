"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Listing, ListingType } from "@zhivago/shared";
import { ListingCard } from "@/components/ListingCard";
import shared from "./shared.module.css";
import styles from "./PropertyDiscoverySection.module.css";

type Filter = "todos" | "aluguel" | "venda" | ListingType;

const FILTERS: { id: Filter; label: string; href?: string }[] = [
  { id: "todos", label: "Todos os destaques" },
  { id: "aluguel", label: "Alugar", href: "/imoveis?categoria=aluguel" },
  { id: "venda", label: "Comprar", href: "/imoveis?categoria=venda" },
  { id: "apartamento", label: "Apartamentos", href: "/imoveis?tipo=apartamento" },
  { id: "casa", label: "Casas", href: "/imoveis?tipo=casa" },
];

export function PropertyDiscoverySection({
  listings,
  loadError = false,
}: {
  listings: Listing[];
  loadError?: boolean;
}) {
  const [filter, setFilter] = useState<Filter>("todos");

  const filtered = useMemo(() => {
    if (filter === "todos") return listings;
    if (filter === "aluguel" || filter === "venda") {
      return listings.filter((listing) => listing.category === filter);
    }
    return listings.filter((listing) => listing.type === filter);
  }, [listings, filter]);

  const activeFilterItem = FILTERS.find((f) => f.id === filter);
  const targetExploreUrl = activeFilterItem?.href ?? "/imoveis";

  return (
    <section className={styles.section} id="descobrir">
      <div className={shared.wrap}>
        <div className={styles.head}>
          <div>
            <div className={shared.sectionKicker}>Curadoria Zhivago</div>
            <h2 className={shared.sectionTitle}>Imóveis selecionados prontos para morar</h2>
            <p className={shared.sectionSub}>Casas e apartamentos com fotos auditadas e disponibilidade atualizada.</p>
          </div>
          <Link href={targetExploreUrl} className={styles.viewAll}>
            Explorar no catálogo completo
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </Link>
        </div>

        <div className={styles.filters}>
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`${styles.filterChip} ${filter === item.id ? styles.filterChipActive : ""}`}
              onClick={() => setFilter(item.id)}
              aria-pressed={filter === item.id}
            >
              {item.label}
            </button>
          ))}
        </div>

        {loadError ? (
          <p className={styles.stateMessage}>Não foi possível carregar os imóveis agora. Tente novamente em instantes.</p>
        ) : filtered.length === 0 ? (
          <div className={styles.emptyStateContainer}>
            <p className={styles.stateMessage}>Nenhum imóvel em destaque encontrado nesta visualização inicial.</p>
            <Link href={targetExploreUrl} className={shared.btnSecondary}>
              Buscar todos os imóveis desta categoria no banco de dados
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </Link>
          </div>
        ) : (
          <div className={styles.grid}>
            {filtered.map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
