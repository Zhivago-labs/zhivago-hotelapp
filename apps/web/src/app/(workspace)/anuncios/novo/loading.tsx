import { LoadingState } from "@/components/feedback/LoadingState";
import styles from "@/components/feedback/Feedback.module.css";
export default function Loading() { return <main className={styles.page}><LoadingState title="Carregando formulário…" description="Só um instante para você começar a anunciar seu imóvel." variant="form" /></main>; }
