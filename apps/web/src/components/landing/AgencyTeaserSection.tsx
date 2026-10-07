import Link from "next/link";
import shared from "./shared.module.css";
import styles from "./AgencyTeaserSection.module.css";

/** Chamada curta para o produto B2B — o detalhe do CRM fica em /para-imobiliarias. */
export function AgencyTeaserSection() {
  return (
    <section className={styles.section} aria-labelledby="agency-title">
      <div className={`${shared.wrap} ${styles.inner}`}>
        <div>
          <h2 id="agency-title" className={`${shared.sectionTitle} ${styles.title}`}>
            Para imobiliárias
          </h2>
          <p className={styles.text}>
            Publique seus imóveis, organize seus leads e acompanhe suas negociações com as ferramentas do Zhivago.
          </p>
        </div>
        <Link href="/para-imobiliarias" className={styles.cta}>
          Conhecer solução para imobiliárias
          <span aria-hidden="true">→</span>
        </Link>
      </div>
    </section>
  );
}
