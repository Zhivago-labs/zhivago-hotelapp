import { PageState } from "@/components/feedback/PageState";
import styles from "@/components/feedback/Feedback.module.css";
export default function NotFound() { return <main className={styles.page}><PageState kind="not-found" title="Não encontramos esta página" message="O endereço pode ter mudado ou o conteúdo não está mais disponível. Continue explorando os imóveis publicados." href="/imoveis" /></main>; }
