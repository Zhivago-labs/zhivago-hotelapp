import type { Metadata } from "next";
import type { ListingType } from "@zhivago/shared";
import { getListings } from "@/lib/api";
import { getSessionUser } from "@/lib/session";
import type { Category } from "@/components/ListingsExplorer";
import { StreamingListingsExplorer } from "@/components/StreamingListingsExplorer";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Explorar imóveis" };

const LISTING_TYPES: ListingType[] = ["casa", "apartamento"];

type Props = {
  searchParams: Promise<{ q?: string; tipo?: string; categoria?: string; precoMin?: string; precoMax?: string }>;
};

const CATEGORIES: Category[] = ["aluguel", "venda", "temporada"];

/** Só aceita inteiros positivos — o resto é ignorado em vez de quebrar o filtro. */
function parsePrice(value?: string): string {
  return value && /^\d{1,10}$/.test(value) ? value : "";
}

export default async function ImoveisPage({ searchParams }: Props) {
  const user = await getSessionUser();

  // Contas de imobiliária são "back-office": gerenciam o próprio inventário


  // ?q=&tipo=&categoria=&precoMin=&precoMax= vêm da busca do hero da home — validados aqui e
  // usados pra inicializar o filtro do ListingsExplorer, em vez de servir só de decoração.
  const { q, tipo, categoria, precoMin, precoMax } = await searchParams;
  const initialType = LISTING_TYPES.includes(tipo as ListingType) ? (tipo as ListingType) : null;
  const initialCategory = CATEGORIES.includes(categoria as Category) ? (categoria as Category) : "todos";

  const result = getListings().then(
    (listings) => ({ listings, loadError: false }),
    () => ({ listings: [], loadError: true }),
  );

  return (
    <main className={styles.main}>
      <div className={styles.heroSection}>
        <h1 className={styles.title}>Explorar imóveis</h1>
        <p className={styles.subtitle}>Casas e apartamentos para comprar, alugar ou ficar por temporada.</p>
      </div>

      <StreamingListingsExplorer
        result={result}
        isAdmin={user?.role === "ADMIN"}
        initialQuery={q ?? ""}
        initialType={initialType}
        initialCategory={initialCategory}
        initialMinPrice={parsePrice(precoMin)}
        initialMaxPrice={parsePrice(precoMax)}
      />
    </main>
  );
}
