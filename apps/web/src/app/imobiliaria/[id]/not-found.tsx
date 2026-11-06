import Link from "next/link";
import styles from "./page.module.css";
export default function NotFound() { return <main className={styles.main}><h1>Perfil não encontrado</h1><p>Esta imobiliária não está disponível.</p><Link href="/imoveis">Explorar imóveis</Link></main>; }
