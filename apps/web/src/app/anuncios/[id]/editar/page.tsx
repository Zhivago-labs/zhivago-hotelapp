import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft, Sparkles, Lightbulb, Camera, MapPin, Tag } from "lucide-react";
import { requireAuth } from "@/lib/session";
import { getListing } from "@/lib/api";
import { getMyOrganization, getOrganizationBuildings } from "@/lib/organizations-api";
import { EditListingForm } from "@/components/listings/EditListingForm";
import styles from "../../listing-form.module.css";

export const metadata: Metadata = { title: "Editar anúncio | Zhivago" };

type Params = { params: Promise<{ id: string }> };

export default async function EditListingPage({ params }: Params) {
  const { id } = await params;
  const { user, token } = await requireAuth(`/anuncios/${id}/editar`);

  const listing = await getListing(id, token);
  if (!listing) notFound();

  const myOrg = await getMyOrganization(token);

  // Mesma regra de `canManageOrgListing` no backend: dono (pessoa física), ou OWNER/ADMIN de
  // qualquer imóvel da própria organização, ou o BROKER responsável por este imóvel específico.
  // Antes só checava `owner?.id === user.id`, o que 404'ava SEMPRE pra imóvel de organização
  // (ownerId nunca é preenchido nesse caso) — ninguém conseguia editar um anúncio de imobiliária
  // por aqui.
  const isOwner = listing.owner?.id === user.id;
  const isOrgManager = !!listing.organizationId && !!myOrg && (myOrg.role === "OWNER" || myOrg.role === "ADMIN");
  const isAssignedBroker = !!listing.organizationId && listing.agentId === user.id;
  if (!isOwner && !isOrgManager && !isAssignedBroker) notFound();

  const buildings = myOrg ? await getOrganizationBuildings(token) : [];

  return (
    <main className={styles.main}>
      <div className={styles.layoutGrid}>
        {/* Lado Esquerdo: Sidebar Fixa */}
        <aside className={styles.sidebar}>
          <Link href={user.role === "ADMIN" ? "/imoveis" : "/dashboard"} className={styles.backLink}>
            <ArrowLeft size={16} />
            <span>{user.role === "ADMIN" ? "Voltar aos imóveis" : "Voltar ao dashboard"}</span>
          </Link>

          <div className={styles.headerContent}>
            <div className={styles.titleBadge}>
              <Sparkles size={14} />
              <span>Editar Anúncio</span>
            </div>
            <h1 className={styles.title}>Editar informações do imóvel</h1>
            <p className={styles.subtitle}>
              Atualize fotos, preços, comodidades ou localização do seu anúncio.
            </p>
          </div>

          <div className={styles.tipsCard}>
            <h3 className={styles.tipsTitle}>
              <Lightbulb size={18} style={{ color: "var(--accent)" }} />
              Dicas de atualização
            </h3>
            <div className={styles.tipItem}>
              <Camera size={16} className={styles.tipIcon} />
              <span>Mantenha as fotos atualizadas caso tenha feito melhorias no imóvel.</span>
            </div>
            <div className={styles.tipItem}>
              <Tag size={16} className={styles.tipIcon} />
              <span>Ajuste o valor das diárias para temporadas de alta ou baixa demanda.</span>
            </div>
          </div>
        </aside>

        {/* Lado Direito: Formulário de Edição */}
        <div className={styles.contentArea}>
          <EditListingForm
            listing={listing}
            myOrg={myOrg}
            buildings={buildings.map((b) => ({ id: b.id, name: b.name, address: b.address }))}
          />
        </div>
      </div>
    </main>
  );
}
