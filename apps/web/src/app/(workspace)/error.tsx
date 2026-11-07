"use client";
import styles from "@/components/workspace/Workspace.module.css";
export default function Error({ reset }: { reset: () => void }) { return <main className={styles.page}><h1>Não foi possível carregar os dados</h1><p>Os registros foram preservados. Tente novamente em instantes.</p><button className={styles.secondary} onClick={reset}>Tentar novamente</button></main>; }
