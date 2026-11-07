"use client";
import { ErrorState } from "@/components/ErrorState";
import styles from "@/components/feedback/Feedback.module.css";
export default function Error({ unstable_retry }: { unstable_retry: () => void }) { return <main className={styles.page}><ErrorState title="Não conseguimos abrir esta área" message="Houve um problema ao buscar as informações. Tente carregar novamente para continuar." onRetry={unstable_retry} /></main>; }
