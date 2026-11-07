import styles from "./Feedback.module.css";

type Props = { title?: string; description?: string; variant?: "page" | "form" | "profile" | "cards" };

export function LoadingState({ title = "Carregando…", description = "Estamos preparando as informações para você.", variant = "page" }: Props) {
  return (
    <section className={styles.loading} aria-busy="true" aria-label={title}>
      <div className={styles.loadingHeader} role="status" aria-live="polite">
        <span className={styles.mark} aria-hidden="true"><span className={styles.spinner} /></span>
        <div><p className={styles.loadingTitle}>{title}</p><p className={styles.description}>{description}</p></div>
      </div>
      <div aria-hidden="true">
        {variant === "profile" && <div className={`${styles.bone} ${styles.cover}`} />}
        <div className={`${styles.skeletons} ${variant === "cards" ? styles.cards : ""}`}>
          {Array.from({ length: variant === "cards" ? 6 : variant === "form" ? 2 : 3 }, (_, index) => (
            <div className={styles.skeletonCard} key={index}>
              {variant === "cards" && <div className={`${styles.bone} ${styles.image}`} />}
              <div className={styles.skeletonBody}>
                <span className={`${styles.bone} ${styles.short}`} />
                {variant === "form" ? <div className={styles.row}><span className={`${styles.bone} ${styles.field}`} /><span className={`${styles.bone} ${styles.field}`} /></div> : <span className={`${styles.bone} ${styles.medium}`} />}
                <span className={styles.bone} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
