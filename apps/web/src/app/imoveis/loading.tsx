import { LoadingState } from "@/components/feedback/LoadingState";
import styles from "./loading.module.css";
export default function Loading() { return <main className={styles.main}><LoadingState title="Buscando imóveis…" description="Preparando os anúncios para sua busca." variant="cards" /></main>; }
