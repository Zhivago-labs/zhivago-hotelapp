import Link from "next/link";
import type { Listing } from "@zhivago/shared";
import { ListingCard } from "@/components/ListingCard";
import shared from "./shared.module.css";
import styles from "./FeaturedListingsSection.module.css";

export function FeaturedListingsSection({
  listings,
  loadError = false,
}: {
  listings: Listing[];
  loadError?: boolean;
}) {
  return (
    <section className={styles.section} id="destaques" aria-labelledby="featured-title">
      <div className={shared.wrap}>
        <div className={styles.head}>
          <h2 id="featured-title" className={shared.sectionTitle}>
            Imóveis em destaque
          </h2>
          {listings.length > 0 && (
            <Link href="/imoveis" className={styles.viewAll}>
              Ver todos os imóveis
              <span aria-hidden="true">→</span>
            </Link>
          )}
        </div>

        {loadError ? (
          <p className={styles.state}>Não foi possível carregar os imóveis agora. Tente novamente em instantes.</p>
        ) : listings.length === 0 ? (
          <div className={styles.empty}>
            <p className={styles.state}>Ainda não há imóveis publicados por aqui. Que tal ser o primeiro a anunciar?</p>
            <Link href="/anuncios/novo" className={shared.btnPrimary}>
              Anunciar imóvel
            </Link>
          </div>
        ) : (
          <div className={styles.grid}>
            {listings.map((listing) => (
              <ListingCard key={listing.id} listing={listing} compactLocation />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
