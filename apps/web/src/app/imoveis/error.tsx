"use client";
import { ErrorState } from "@/components/ErrorState";
import styles from "@/components/feedback/Feedback.module.css";
export default function Error({ unstable_retry }: { unstable_retry: () => void }) { return <main className={styles.page}><ErrorState title="A busca não carregou" message="Não conseguimos buscar os imóveis agora. Tente novamente em instantes." onRetry={unstable_retry} /></main>; }
