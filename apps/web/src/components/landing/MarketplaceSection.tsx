import shared from "./shared.module.css";
import styles from "./MarketplaceSection.module.css";

const FEATURES = [
  "Filtre por cidade, preço, tipo e características até achar o imóvel ideal.",
  "Negocie direto pelo chat com quem anuncia, sem intermediário.",
  "Salve favoritos e acompanhe o status de cada reserva num só lugar.",
  "Todo anúncio passa por moderação antes de ficar público.",
];

export function MarketplaceSection({ featuredImage }: { featuredImage: string | null }) {
  return (
    <section className={styles.section} id="marketplace">
      <div className={`${shared.wrap} ${styles.grid}`}>
        <div className={styles.media}>
          {featuredImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={featuredImage} alt="Imóvel anunciado no Zhivago" className={styles.image} />
          ) : (
            <div className={styles.imageFallback} />
          )}
        </div>

        <div className={styles.copy}>
          <div className={shared.sectionKicker}>A experiência Zhivago</div>
          <h2 className={shared.sectionTitle}>Mais que um anúncio de imóvel</h2>
          <p className={shared.sectionSub}>
            O Zhivago reúne busca de imóveis e conversa direta num só lugar, tornando mais simples
            ir de encontrar um imóvel a falar com quem está por trás dele.
          </p>

          <ul className={styles.list}>
            {FEATURES.map((feature) => (
              <li key={feature}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
