import styles from "./Feedback.module.css";

export function InlineLoading({ children }: { children: string }) {
  return <span className={styles.inlineLoading} role="status"><span className={styles.spinner} aria-hidden="true" />{children}</span>;
}
