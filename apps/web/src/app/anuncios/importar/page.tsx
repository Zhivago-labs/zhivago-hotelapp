import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { requireAuth } from "@/lib/session";
import { ImportListingsForm } from "@/components/listings/ImportListingsForm";
import styles from "../listing-form.module.css";

export const metadata: Metadata = { title: "Importar anúncios em lote" };

export default async function ImportListingsPage() {
  const { user } = await requireAuth("/anuncios/importar");

  if (user.accountType !== "AGENCY") {
    return (
      <main className={styles.main}>
        <Link href={user.role === "ADMIN" ? "/imoveis" : "/dashboard"} className={styles.backLink}>
          <ArrowLeft size={15} />
          {user.role === "ADMIN" ? "Voltar aos imóveis" : "Voltar ao dashboard"}
        </Link>
        <p>Importação em lote é exclusiva para contas Imobiliária.</p>
      </main>
    );
  }

  return (
    <main className={styles.main}>
      <Link href={user.role === "ADMIN" ? "/imoveis" : "/dashboard"} className={styles.backLink}>
        <ArrowLeft size={15} />
        {user.role === "ADMIN" ? "Voltar aos imóveis" : "Voltar ao dashboard"}
      </Link>
      <h1 className={styles.title}>Importar anúncios em lote</h1>
      <ImportListingsForm />
    </main>
  );
}
