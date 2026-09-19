"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Listing, ListingType } from "@zhivago/shared";
import { ListingCard } from "@/components/ListingCard";
import shared from "./shared.module.css";
import styles from "./PropertyDiscoverySection.module.css";

type Filter = "todos" | "aluguel" | "venda" | ListingType;

const FILTERS: { id: Filter; label: string }[] = [
  { id: "todos", label: "Todos" },
  { id: "aluguel", label: "Alugar" },
  { id: "venda", label: "Comprar" },
  { id: "apartamento", label: "Apartamentos" },
  { id: "casa", label: "Casas" },
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

  return (
    <section className={styles.section} id="descobrir">
      <div className={shared.wrap}>
        <div className={styles.head}>
          <div>
            <div className={shared.sectionKicker}>Imóveis em destaque</div>
            <h2 className={shared.sectionTitle}>Encontre um lugar que você vai amar</h2>
            <p className={shared.sectionSub}>Explore imóveis selecionados pra diferentes jeitos de viver.</p>
          </div>
          <Link href="/imoveis" className={styles.viewAll}>
            Ver todos os imóveis
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
          <p className={styles.stateMessage}>Nenhum imóvel encontrado nessa categoria por enquanto.</p>
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
