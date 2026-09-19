import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Building2 } from "lucide-react";
import { requireAuth } from "@/lib/session";
import { getMyListings, type OwnedListing } from "@/lib/listings-api";
import { OwnerListingsSection } from "@/components/dashboard/OwnerListingsSection";
import styles from "./meus-anuncios.module.css";

export const metadata: Metadata = { title: "Meus Anúncios | Zhivago" };

export default async function MyListingsPage() {
  const { token, user } = await requireAuth("/meus-anuncios");
  const isAgency = user.accountType === "AGENCY";

  let listings: OwnedListing[] = [];
  let loadError = false;

  try {
    listings = await getMyListings(token);
  } catch {
    loadError = true;
  }

  return (
    <main className={styles.main}>
      <div className={styles.header}>
        <div>
          <div className={styles.titleBadge}>
            <Building2 size={14} />
            <span>Gerenciador de Imóveis</span>
          </div>
          <h1 className={styles.title}>Meus Anúncios</h1>
          <p className={styles.subtitle}>
            Gerencie o status dos seus imóveis, aplique descontos promocionais, edite dados ou exclua anúncios.
          </p>
        </div>

        <Link href="/anuncios/novo" className={styles.newBtn}>
          <Plus size={18} />
          <span>Anunciar Imóvel</span>
        </Link>
      </div>

      {loadError ? (
        <p className={styles.error}>
          Não foi possível carregar seus imóveis no momento. Tente novamente em instantes.
        </p>
      ) : (
        <OwnerListingsSection initialListings={listings} isAgency={isAgency} hideHeader={true} />
      )}
    </main>
  );
}
