"use client";
import { ErrorState } from "@/components/ErrorState";
import styles from "@/components/feedback/Feedback.module.css";
export default function Error({ unstable_retry }: { unstable_retry: () => void }) { return <main className={styles.page}><ErrorState title="Esta página não carregou" message="Não conseguimos concluir o carregamento. Tente novamente ou volte em alguns instantes." onRetry={unstable_retry} /></main>; }
