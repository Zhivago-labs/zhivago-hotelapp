"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Heart, Search, ArrowLeft, Building2 } from "lucide-react";
import { useFavorites } from "@/components/favorites/FavoritesContext";
import { getPublicApiUrl } from "@/lib/public-api";
import { ListingCard } from "@/components/ListingCard";
import type { Listing } from "@zhivago/shared";
import styles from "./page.module.css";

export default function FavoritesPage() {
  const { favorites } = useFavorites();
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${getPublicApiUrl()}/listings`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data: Listing[]) => {
        setListings(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const favoriteListings = listings.filter((l) => favorites.includes(l.id));

  return (
    <main className={styles.main}>
      <div className={styles.container}>
        <div className={styles.header}>
          <Link href="/imoveis" className={styles.backLink}>
            <ArrowLeft size={18} />
            Voltar aos imóveis
          </Link>
          <div className={styles.titleRow}>
            <h1 className={styles.title}>
              <Heart size={28} className={styles.titleIcon} />
              Meus Favoritos
            </h1>
            <span className={styles.countBadge}>
              {favoriteListings.length} {favoriteListings.length === 1 ? "imóvel" : "imóveis"}
            </span>
          </div>
          <p className={styles.subtitle}>
            Seus imóveis salvos para comparar valores, características e estadias.
          </p>
        </div>

        {loading ? (
          <div className={styles.loadingBox}>
            <span className={styles.spinner} />
            <span>Carregando seus imóveis favoritos…</span>
          </div>
        ) : favoriteListings.length === 0 ? (
          <div className={styles.emptyCard}>
            <div className={styles.emptyIconCircle}>
              <Building2 size={36} />
            </div>
            <h2 className={styles.emptyTitle}>Sua lista de favoritos está vazia</h2>
            <p className={styles.emptyText}>
              Você ainda não salvou nenhum imóvel. Clique no ícone de coração nos anúncios para salvar os seus imóveis preferidos!
            </p>
            <Link href="/imoveis" className={styles.exploreButton}>
              <Search size={18} />
              Explorar Imóveis
            </Link>
          </div>
        ) : (
          <div className={styles.grid}>
            {favoriteListings.map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
