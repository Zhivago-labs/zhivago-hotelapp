import styles from "./ImageLoadingIndicator.module.css";

/** Spinner discreto sobre a foto anterior enquanto a próxima ainda baixa. */
export function ImageLoadingIndicator({ visible, size = 36 }: { visible: boolean; size?: number }) {
  if (!visible) return null;
  return (
    <span className={styles.wrap} role="status" aria-label="Carregando foto">
      <span className={styles.spinner} style={{ width: size, height: size }} />
    </span>
  );
}
