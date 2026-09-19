import Link from "next/link";
import shared from "./shared.module.css";
import styles from "./CtaSection.module.css";

export function CtaSection() {
  return (
    <section className={styles.ctaSection} id="cta">
      <div className={shared.wrap}>
        <div className={styles.ctaCard}>
          <h3>Seu próximo endereço pode estar mais perto do que você imagina.</h3>
          <div className={styles.ctaActions}>
            <Link href="/imoveis" className={shared.btnPrimary}>
              Explorar imóveis
            </Link>
            <Link href="/cadastro" className={shared.btnSecondary}>
              Criar conta
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
