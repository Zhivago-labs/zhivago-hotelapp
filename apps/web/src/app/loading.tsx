import { LoadingState } from "@/components/feedback/LoadingState";
import styles from "@/components/feedback/Feedback.module.css";
export default function Loading() { return <main className={styles.page}><LoadingState title="Preparando sua próxima página" description="Os detalhes já estão a caminho." variant="page" /></main>; }
