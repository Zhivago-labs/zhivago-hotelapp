import styles from "@/components/workspace/Workspace.module.css";
export default function Loading() { return <main className={styles.page} aria-busy="true"><p role="status">Verificando acesso…</p></main>; }
