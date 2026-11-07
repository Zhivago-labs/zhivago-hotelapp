import { LoadingState } from "@/components/feedback/LoadingState";
import styles from "./page.module.css";
export default function Loading() { return <main className={styles.main}><LoadingState title="Carregando imobiliária…" description="Buscando o perfil e os imóveis publicados." variant="profile" /></main>; }
