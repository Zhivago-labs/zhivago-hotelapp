import { redirect } from "next/navigation";
import type { Metadata } from "next";
import type { Listing, ListingType } from "@zhivago/shared";
import { getListings } from "@/lib/api";
import { getSessionUser } from "@/lib/session";
import { ListingsExplorer } from "@/components/ListingsExplorer";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Explorar imóveis" };

const LISTING_TYPES: ListingType[] = ["casa", "apartamento"];

type Props = { searchParams: Promise<{ q?: string; tipo?: string; categoria?: string }> };

export default async function ImoveisPage({ searchParams }: Props) {
  let listings: Listing[];
  let loadError = false;
  const user = await getSessionUser();

  // Contas de imobiliária são "back-office": gerenciam o próprio inventário
  if (user?.accountType === "AGENCY" && user.role !== "ADMIN") {
    redirect("/dashboard");
  }

  // ?q=&tipo=&categoria= vêm da busca do hero da home — mesma sintaxe validada aqui e usada
  // pra inicializar o filtro do ListingsExplorer, em vez de servir só de decoração.
  const { q, tipo, categoria } = await searchParams;
  const initialType = LISTING_TYPES.includes(tipo as ListingType) ? (tipo as ListingType) : null;
  const initialCategory = categoria === "aluguel" || categoria === "venda" ? categoria : "todos";

  try {
    listings = await getListings();
  } catch {
    loadError = true;
    listings = [];
  }

  return (
    <main className={styles.main}>
      <div className={styles.heroSection}>
        <h1 className={styles.title}>Explorar imóveis</h1>
        <p className={styles.subtitle}>Casas e apartamentos para alugar ou comprar.</p>
      </div>

      <ListingsExplorer
        listings={listings}
        isAdmin={user?.role === "ADMIN"}
        loadError={loadError}
        initialQuery={q ?? ""}
        initialType={initialType}
        initialCategory={initialCategory}
      />
    </main>
  );
}
