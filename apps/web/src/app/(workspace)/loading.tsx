import { LoadingState } from "@/components/feedback/LoadingState";
import styles from "@/components/feedback/Feedback.module.css";
export default function Loading() { return <main className={styles.page}><LoadingState title="Verificando acesso…" description="Estamos preparando esta área para sua conta." variant="page" /></main>; }
