import Link from "next/link";
import type { Listing } from "@zhivago/shared";
import { formatPrice } from "@/lib/api";
import { FavoriteButton } from "@/components/favorites/FavoriteButton";
import shared from "./shared.module.css";
import styles from "./LandingHero.module.css";

const STATUS_LABEL: Record<Listing["status"], string> = {
  PENDING: "Em análise",
  APPROVED: "Disponível",
  REJECTED: "Indisponível",
  REMOVED: "Indisponível",
  SOLD: "Vendido",
};

export function LandingHero({
  featuredListing,
  locations,
}: {
  featuredListing: Listing | null;
  locations: string[];
}) {
  return (
    <header className={styles.hero}>
      <div className={`${shared.wrap} ${styles.heroGrid}`}>
        <div>
          <div className={styles.badge}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M12 2l2.4 7.2H22l-6 4.6 2.3 7.2-6.3-4.5-6.3 4.5 2.3-7.2-6-4.6h7.6z" />
            </svg>
            <span>Marketplace de imóveis + CRM imobiliário</span>
          </div>

          <h1 className={styles.heroTitle}>Encontre um lugar pra chamar de seu.</h1>
          <p className={styles.heroSub}>
            Descubra casas e apartamentos que combinam com o seu jeito de viver — pra alugar por
            temporada, pelo mês, ou comprar.
          </p>

          {/* ── busca real: GET puro pra /imoveis, mesmo motor de filtro da página de resultados ── */}
          <form action="/imoveis" method="GET" className={styles.searchCard}>
            <div className={styles.searchField}>
              <label htmlFor="hero-q">Localização</label>
              <input
                id="hero-q"
                name="q"
                type="text"
                placeholder="Cidade"
                list="hero-locations"
                autoComplete="off"
              />
              <datalist id="hero-locations">
                {locations.map((location) => (
                  <option key={location} value={location} />
                ))}
              </datalist>
            </div>

            <div className={styles.searchDivider} />

            <div className={styles.searchField}>
              <label htmlFor="hero-tipo">Imóvel</label>
              <select id="hero-tipo" name="tipo" defaultValue="">
                <option value="">Qualquer tipo</option>
                <option value="casa">Casa</option>
                <option value="apartamento">Apartamento</option>
              </select>
            </div>

            <div className={styles.searchDivider} />

            <div className={styles.searchField}>
              <label htmlFor="hero-categoria">Finalidade</label>
              <select id="hero-categoria" name="categoria" defaultValue="">
                <option value="">Tudo</option>
                <option value="aluguel">Alugar</option>
                <option value="venda">Comprar</option>
              </select>
            </div>

            <button type="submit" className={styles.searchSubmit}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="7" />
                <path d="M21 21l-4.3-4.3" />
              </svg>
              Buscar
            </button>
          </form>

          <div className={styles.heroActions}>
            <Link href="/imoveis" className={shared.btnSecondary}>
              Ver todos os imóveis
            </Link>
            <Link href="#crm" className={shared.btnSecondary}>
              Ver o CRM para imobiliárias
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </Link>
          </div>
        </div>

        <div className={styles.heroVisual}>
          {featuredListing ? (
            <Link href={`/imovel/${featuredListing.id}`} className={styles.propCard}>
              <div className={styles.propPhoto}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={featuredListing.images[0].url} alt={featuredListing.name} className={styles.propImg} />
                <div className={styles.propFav}>
                  <FavoriteButton listingId={featuredListing.id} size={15} />
                </div>
              </div>
              <div className={styles.propBody}>
                <div className={styles.propLoc}>{featuredListing.location}</div>
                <div className={styles.propName}>{featuredListing.name}</div>
                <div className={styles.propMeta}>
                  <span>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 10.5L12 4l9 6.5V20a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z" />
                    </svg>
                    {featuredListing.bedrooms} quartos
                  </span>
                  <span>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="7" width="18" height="4" />
                      <path d="M5 7V5a2 2 0 012-2h10a2 2 0 012 2v2M5 11v8M19 11v8" />
                    </svg>
                    {featuredListing.parking} vaga{featuredListing.parking === 1 ? "" : "s"}
                  </span>
                </div>
                <div className={styles.propFoot}>
                  <div className={styles.propPrice}>{formatPrice(featuredListing)}</div>
                  <div className={styles.propStatus}>{STATUS_LABEL[featuredListing.status]}</div>
                </div>
              </div>
            </Link>
          ) : (
            <div className={styles.propCardEmpty}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M3 10.5L12 4l9 6.5V20a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z" />
              </svg>
              <span>Novos imóveis chegando em breve</span>
            </div>
          )}

          <div className={`${styles.floatChip} ${styles.chipMsg}`}>
            <span className={styles.dot} /> Converse direto com quem anuncia
          </div>
          <div className={`${styles.floatChip} ${styles.chipVerify}`}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6L9 17l-5-5" />
            </svg>
            Anúncio moderado
          </div>
        </div>
      </div>
    </header>
  );
}
