import Link from "next/link";
import { ArrowRight, CircleAlert, Search, Heart, RefreshCw } from "lucide-react";
import styles from "./Feedback.module.css";

type Props = { title: string; message: string; kind?: "error" | "empty" | "not-found" | "favorites"; onRetry?: () => void; retrying?: boolean; href?: string; actionLabel?: string };

export function PageState({ title, message, kind = "error", onRetry, retrying, href, actionLabel = "Explorar imóveis" }: Props) {
  const Icon = kind === "error" ? CircleAlert : kind === "favorites" ? Heart : Search;
  return (
    <section className={styles.state} aria-label={title}>
      <span className={styles.mark} aria-hidden="true"><Icon size={27} strokeWidth={1.6} /></span>
      <p className={styles.eyebrow}>{kind === "error" ? "Vamos tentar de novo" : kind === "not-found" ? "Página indisponível" : "Novas possibilidades"}</p>
      <h2 className={styles.title}>{title}</h2>
      <p className={styles.description} role={kind === "error" ? "alert" : undefined}>{message}</p>
      {(onRetry || href) && <div className={styles.actions}>
        {onRetry && <button type="button" className={styles.primary} onClick={onRetry} disabled={retrying}><RefreshCw size={16} aria-hidden="true" />{retrying ? "Tentando novamente…" : "Tentar novamente"}</button>}
        {href && <Link href={href} className={onRetry ? styles.secondary : styles.primary}>{actionLabel}<ArrowRight size={16} aria-hidden="true" /></Link>}
      </div>}
    </section>
  );
}
