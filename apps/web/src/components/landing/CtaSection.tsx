import Link from "next/link";
import shared from "./shared.module.css";
import styles from "./CtaSection.module.css";

export function CtaSection() {
  return (
    <section className={styles.ctaSection} id="cta">
      <div className={shared.wrap}>
        <div className={styles.ctaBox}>
          <div className={styles.ctaHeader}>
            <h2 className={styles.ctaTitle}>
              Pronto para avançar na sua próxima negociação?
            </h2>
            <p className={styles.ctaSub}>
              Crie sua conta para entrar em contato com proprietários ou configure a presença da sua imobiliária com CRM integrado.
            </p>
          </div>

          <div className={styles.ctaGrid}>
            <div className={styles.ctaCard}>
              <h3 className={styles.cardHeading}>Para quem procura imóvel</h3>
              <p className={styles.cardText}>
                Pesquise no catálogo com fotos verificadas e converse diretamente com quem tem as chaves.
              </p>
              <Link href="/imoveis" className={styles.btnPrimary}>
                Explorar catálogo de imóveis &rarr;
              </Link>
            </div>

            <div className={styles.ctaCard}>
              <h3 className={styles.cardHeading}>Para imobiliárias e corretores</h3>
              <p className={styles.cardText}>
                Publique seus anúncios e gerencie sua equipe de vendas com distribuição automática de leads.
              </p>
              <Link href="/cadastro" className={styles.btnSecondary}>
                Cadastrar organização imobiliária &rarr;
              </Link>
            </div>
          </div>

          <div className={styles.ctaFootnote}>
            <span>Sem taxas ocultas</span>
            <span className={styles.dot}>&bull;</span>
            <span>Anúncios auditados</span>
            <span className={styles.dot}>&bull;</span>
            <span>Privacidade de dados garantida</span>
          </div>
        </div>
      </div>
    </section>
  );
}
