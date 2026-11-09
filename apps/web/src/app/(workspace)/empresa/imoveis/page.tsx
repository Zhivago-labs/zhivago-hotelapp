import Link from "next/link";
import { requireWorkspace } from "@/lib/workspace";
import { getOrganizationListings, getMyAssignedListings } from "@/lib/organizations-api";
import { CompactListings } from "@/components/workspace/CompactListings";
import styles from "@/components/workspace/Workspace.module.css";
export const metadata = { title: "Imóveis da imobiliária" };
export default async function Properties({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { token, user, membership } = await requireWorkspace("/empresa/imoveis");
  const orgWide = ["OWNER", "ADMIN", "MANAGER", "ASSISTANT"].includes(membership.role);
  const listings = orgWide ? await getOrganizationListings(token) : await getMyAssignedListings(token);
  const { status } = await searchParams;
  const initialStatus = status === "SOLD" ? "SOLD" : "";
  return <main className={styles.page}>
    <div className={styles.header}><div><h1>Imóveis</h1><p className={styles.muted}>{orgWide ? "Portfólio da imobiliária" : "Anúncios sob sua responsabilidade"}. O responsável pelo anúncio é independente do responsável pela oportunidade.</p></div>{["OWNER", "ADMIN", "BROKER"].includes(membership.role) && <Link href="/anuncios/importar" className={styles.secondary}>Importar em lote</Link>}</div>
    <nav className={styles.filters} aria-label="Disponibilidade dos imóveis">
      <Link href="/empresa/imoveis" className={styles.secondary} aria-current={!initialStatus ? "page" : undefined}>Todos os imóveis</Link>
      <Link href="/empresa/imoveis?status=SOLD" className={styles.secondary} aria-current={initialStatus === "SOLD" ? "page" : undefined}>Vendidos ({listings.filter((listing) => listing.status === "SOLD").length})</Link>
    </nav>
    <p className={styles.muted}>Em análise / rejeitado indicam moderação; publicado, rascunho, vendido e alugado indicam disponibilidade.</p>
    <CompactListings key={initialStatus} listings={listings} role={membership.role} userId={user.id} initialStatus={initialStatus} />
  </main>;
}
