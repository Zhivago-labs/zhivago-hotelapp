import Link from "next/link";
import styles from "./SiteFooter.module.css";

export function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.container}>
        <p className={styles.copyright}>
          © {new Date().getFullYear()} Zhivago. Todos os direitos reservados.
        </p>
        <div className={styles.links}>
          <Link href="/" className={styles.link}>
            Início
          </Link>
          <span className={styles.dot}>·</span>
          <Link href="/termos" className={styles.link}>
            Termos
          </Link>
          <span className={styles.dot}>·</span>
          <Link href="/privacidade" className={styles.link}>
            Privacidade
          </Link>
          <span className={styles.dot}>·</span>
          <Link href="/ajuda" className={styles.link}>
            Ajuda
          </Link>
        </div>
      </div>
    </footer>
  );
}
