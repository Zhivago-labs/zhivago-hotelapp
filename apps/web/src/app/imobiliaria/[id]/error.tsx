"use client";
import { ErrorState } from "@/components/ErrorState";
import styles from "./page.module.css";
export default function Error({ unstable_retry }: { unstable_retry: () => void }) { return <main className={styles.main}><ErrorState title="O perfil não carregou" message="Não conseguimos buscar as informações desta imobiliária agora. Tente novamente em instantes." onRetry={unstable_retry} /></main>; }
