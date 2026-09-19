import styles from "./loading.module.css";

// Mantém o layout estável (evita layout shift) enquanto a lista de imóveis carrega.
export default function LoadingImoveis() {
  return (
    <main className={styles.main}>
      <div className={`${styles.toolbarSkeleton} ${styles.pulse}`} />
      <div className={styles.grid}>
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className={styles.card}>
            <div className={`${styles.cardImage} ${styles.pulse}`} />
            <div className={styles.cardBody}>
              <div className={`${styles.line} ${styles.pulse}`} style={{ height: 16, width: "70%" }} />
              <div className={`${styles.line} ${styles.pulse}`} style={{ height: 13, width: "45%" }} />
              <div className={`${styles.line} ${styles.pulse}`} style={{ height: 13, width: "55%" }} />
              <div className={`${styles.line} ${styles.pulse}`} style={{ height: 18, width: "35%", marginTop: 6 }} />
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
