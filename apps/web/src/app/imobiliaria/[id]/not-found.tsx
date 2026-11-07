import { PageState } from "@/components/feedback/PageState";
import styles from "./page.module.css";
export default function NotFound() { return <main className={styles.main}><PageState kind="not-found" title="Perfil não encontrado" message="Esta imobiliária não está disponível no momento. Você pode continuar a busca por outros imóveis." href="/imoveis" /></main>; }
