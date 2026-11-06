"use client";
import styles from "./page.module.css";
export default function Error({ reset }: { reset: () => void }) { return <main className={styles.main}><h1>Não foi possível carregar a imobiliária</h1><p>Tente novamente em alguns instantes.</p><button className={styles.actionButton} onClick={reset}>Tentar novamente</button></main>; }
