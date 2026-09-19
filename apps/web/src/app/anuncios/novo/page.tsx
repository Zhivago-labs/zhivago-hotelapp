import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, Sparkles, Lightbulb, Camera, MapPin, Tag } from "lucide-react";
import { requireAuth } from "@/lib/session";
import { NewListingForm } from "@/components/listings/NewListingForm";
import styles from "../listing-form.module.css";

export const metadata: Metadata = { title: "Anunciar imóvel | Zhivago" };

export default async function NewListingPage() {
  const { user } = await requireAuth("/anuncios/novo");

  if (user.role === "ADMIN") {
    return (
      <main className={styles.main}>
        <p className={styles.restricted}>Administradores não podem anunciar imóveis.</p>
      </main>
    );
  }

  return (
    <main className={styles.main}>
      <div className={styles.layoutGrid}>
        {/* Lado Esquerdo: Sidebar Fixa com Informações e Dicas */}
        <aside className={styles.sidebar}>
          <Link href="/dashboard" className={styles.backLink}>
            <ArrowLeft size={16} />
            <span>Voltar ao dashboard</span>
          </Link>

          <div className={styles.headerContent}>
            <div className={styles.titleBadge}>
              <Sparkles size={14} />
              <span>Novo Anúncio</span>
            </div>
            <h1 className={styles.title}>Anuncie seu espaço no Zhivago</h1>
            <p className={styles.subtitle}>
              Preencha os detalhes do imóvel para publicar no marketplace ou salvar como rascunho.
            </p>
          </div>

          <div className={styles.tipsCard}>
            <h3 className={styles.tipsTitle}>
              <Lightbulb size={18} style={{ color: "var(--accent)" }} />
              Dicas para um ótimo anúncio
            </h3>
            <div className={styles.tipItem}>
              <Camera size={16} className={styles.tipIcon} />
              <span>Adicione fotos nítidas e bem iluminadas para atrair até 3x mais reservas.</span>
            </div>
            <div className={styles.tipItem}>
              <MapPin size={16} className={styles.tipIcon} />
              <span>Preencha o CEP para auto-completar a localização exata do imóvel.</span>
            </div>
            <div className={styles.tipItem}>
              <Tag size={16} className={styles.tipIcon} />
              <span>Defina um preço justo de acordo com a região para acelerar os resultados.</span>
            </div>
          </div>
        </aside>

        {/* Lado Direito: Formulário com Cards Amplos */}
        <div className={styles.contentArea}>
          <NewListingForm />
        </div>
      </div>
    </main>
  );
}
