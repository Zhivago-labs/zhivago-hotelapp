import { LoadingState } from "@/components/feedback/LoadingState";
import styles from "@/components/feedback/Feedback.module.css";
export default function Loading() { return <main className={styles.page}><LoadingState title="Carregando seus anúncios…" description="Reunindo seus imóveis e informações de publicação." variant="cards" /></main>; }
