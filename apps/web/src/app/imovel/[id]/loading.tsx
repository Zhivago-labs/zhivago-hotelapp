import { LoadingState } from "@/components/feedback/LoadingState";
import styles from "@/components/feedback/Feedback.module.css";
export default function Loading() { return <main className={styles.page}><LoadingState variant="profile" title="Carregando imóvel…" description="Preparando as fotos e os detalhes do anúncio." /></main>; }
