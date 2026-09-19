import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft, Sparkles, Lightbulb, Camera, MapPin, Tag } from "lucide-react";
import { requireAuth } from "@/lib/session";
import { getListing } from "@/lib/api";
import { EditListingForm } from "@/components/listings/EditListingForm";
import styles from "../../listing-form.module.css";

export const metadata: Metadata = { title: "Editar anúncio | Zhivago" };

type Params = { params: Promise<{ id: string }> };

export default async function EditListingPage({ params }: Params) {
  const { id } = await params;
  const { user } = await requireAuth(`/anuncios/${id}/editar`);

  const listing = await getListing(id);
  if (!listing || listing.owner?.id !== user.id) notFound();

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
          <EditListingForm listing={listing} />
        </div>
      </div>
    </main>
  );
}
