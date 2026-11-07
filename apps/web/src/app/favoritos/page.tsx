"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Heart, ArrowLeft } from "lucide-react";
import { LoadingState } from "@/components/feedback/LoadingState";
import { PageState } from "@/components/feedback/PageState";
import { ErrorState } from "@/components/ErrorState";
import { useFavorites } from "@/components/favorites/FavoritesContext";
import { getPublicApiUrl } from "@/lib/public-api";
import { ListingCard } from "@/components/ListingCard";
import type { Listing } from "@zhivago/shared";
import styles from "./page.module.css";

export default function FavoritesPage() {
  const { favorites } = useFavorites();
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${getPublicApiUrl()}/listings`, { signal: controller.signal })
      .then((res) => { if (!res.ok) throw new Error("Falha ao buscar favoritos"); return res.json(); })
      .then((data: Listing[]) => {
        setListings(data);
        setLoading(false);
      })
      .catch(() => { if (!controller.signal.aborted) { setLoadError(true); setLoading(false); } });
    return () => controller.abort();
  }, [attempt]);

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
            {!loading && !loadError && <span className={styles.countBadge}>
              {favoriteListings.length} {favoriteListings.length === 1 ? "imóvel" : "imóveis"}
            </span>}
          </div>
          <p className={styles.subtitle}>
            Seus imóveis salvos para comparar valores, características e estadias.
          </p>
        </div>

        {loading ? (
          <LoadingState variant="cards" title="Carregando seus favoritos…" description="Reunindo os imóveis que você salvou." />
        ) : loadError ? (
          <ErrorState title="Seus favoritos não carregaram" message="Não conseguimos buscar os imóveis agora. Tente novamente para ver sua lista." onRetry={() => { setLoadError(false); setLoading(true); setAttempt(value => value + 1); }} />
        ) : favoriteListings.length === 0 ? (
          <PageState kind="favorites" title="Seus próximos favoritos começam aqui" message="Toque no coração de um anúncio para salvá-lo e comparar os imóveis depois." href="/imoveis" />
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
