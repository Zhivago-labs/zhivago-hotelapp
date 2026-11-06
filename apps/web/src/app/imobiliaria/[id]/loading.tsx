import styles from "./page.module.css";
export default function Loading() { return <main className={styles.main} aria-busy="true"><p role="status">Carregando imobiliária…</p></main>; }
