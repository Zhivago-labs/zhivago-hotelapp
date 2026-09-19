import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import {
  Star,
  Building2,
  CalendarDays,
  MessageCircle,
  ShieldCheck,
  Award,
  UserCheck,
  Phone,
  ChevronRight,
  Sparkles,
  Home,
  CheckCircle2,
  Pencil,
} from "lucide-react";
import { getAgencyProfile, type AgencyProfile } from "@/lib/api";
import { getSessionUser } from "@/lib/session";
import { ListingsExplorer } from "@/components/ListingsExplorer";
import { AgencyBadge } from "@/components/AgencyBadge";
import { ShareButton } from "./ShareButton";
import styles from "./page.module.css";

type Params = { params: Promise<{ id: string }> };

// A vitrine vale pra qualquer dono de imóvel: conta de imobiliária (`accountType: AGENCY`),
// membro de uma organização (B2B, cujo perfil já é o da organização inteira) ou anfitrião pessoa
// física comum — nesse último caso é o mesmo perfil só que com textos genéricos (sem CRECI,
// "parceiro oficial" etc.), calculados via `isBusiness` mais abaixo.
function isValidShowcase(profile: AgencyProfile | null): profile is AgencyProfile {
  return !!profile;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const profile = await getAgencyProfile(id);
  if (!isValidShowcase(profile)) return { title: "Perfil não encontrado" };

  const title = profile.organization?.name || profile.user.companyName || profile.user.name;
  return {
    title,
    description: `Confira os imóveis anunciados por ${title} no Zhivago. Encontre opções exclusivas de aluguel e venda com segurança.`,
  };
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

function StarRow({ rating }: { rating: number }) {
  const rounded = Math.round(rating);
  return (
    <span className={styles.starRow}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} size={14} className={n <= rounded ? styles.starFilled : styles.starEmpty} />
      ))}
    </span>
  );
}

export default async function AgencyPage({ params }: Params) {
  const { id } = await params;
  const profile = await getAgencyProfile(id);

  if (!isValidShowcase(profile)) notFound();

  const viewer = await getSessionUser();
  // Contas de imobiliária só enxergam a própria vitrine — a de outra conta é bloqueada. Vitrine de
  // organização (B2B) é a "loja" do time inteiro, então qualquer membro (ou visitante) pode vê-la.
  if (
    viewer?.accountType === "AGENCY" &&
    viewer.role !== "ADMIN" &&
    viewer.id !== profile.user.id &&
    !profile.organization
  ) {
    redirect("/dashboard");
  }

  const { user, organization, listings, reviews } = profile;
  const isBusiness = user.accountType === "AGENCY" || !!organization;
  const displayName = organization?.name || user.companyName || user.name;
  const avatarUrl =
    organization?.logo ??
    user.avatar ??
    `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=f0f0f0&color=0f172a&bold=true`;
  // `user.verified` é "aprovado pelo admin" só no sentido de imobiliária — pra anfitrião pessoa
  // física esse campo não tem esse significado, então o selo de verificado fica restrito a quem
  // é negócio (igual às outras telas que usam AgencyBadge).
  const verified = organization ? organization.verified : isBusiness && user.verified;
  const memberSince = new Date(user.createdAt).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });

  const rentalCount = listings.filter((l) => l.category === "aluguel").length;
  const saleCount = listings.length - rentalCount;
  const avgRating =
    reviews.length > 0 ? Number((reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1)) : null;

  const rawPhone = user.phone ? user.phone.replace(/\D/g, "") : null;
  const formattedPhone = user.phone ?? null;

  const whatsapp = rawPhone
    ? `https://wa.me/55${rawPhone}?text=${encodeURIComponent(
        `Olá! Vi a vitrine de ${displayName} no Zhivago e gostaria de mais informações sobre os imóveis disponíveis.`
      )}`
    : null;

  const isOwnProfile = viewer?.id === user.id;

  return (
    <main className={styles.main}>
      {/* ── BREADCRUMB & TOOLBAR SUPERIOR ── */}
      <nav className={styles.topNav} aria-label="Navegação estrutural">
        <ol className={styles.breadcrumbList}>
          <li>
            <Link href="/" className={styles.breadcrumbLink}>
              <Home size={13} />
              <span>Início</span>
            </Link>
          </li>
          <ChevronRight size={13} className={styles.breadcrumbSeparator} />
          <li>
            <span className={styles.breadcrumbCurrent}>{isBusiness ? "Imobiliárias" : "Anfitriões"}</span>
          </li>
          <ChevronRight size={13} className={styles.breadcrumbSeparator} />
          <li>
            <span className={styles.breadcrumbActive} aria-current="page">
              {displayName}
            </span>
          </li>
        </ol>

        <div className={styles.topNavActions}>
          {isOwnProfile && (
            <Link href="/configuracoes" className={styles.actionButton}>
              <Pencil size={15} />
              <span>Editar perfil</span>
            </Link>
          )}
          <ShareButton title={displayName} />
        </div>
      </nav>

      {/* ── HERO SHOWCASE DE LUXO ── */}
      <header className={styles.hero}>
        <div className={styles.heroCover}>
          <div className={styles.heroCoverPattern} />
          <div className={styles.heroCoverTag}>
            <Sparkles size={13} className={styles.tagIcon} />
            <span>{isBusiness ? "Vitrine Homologada" : "Perfil no Zhivago"}</span>
          </div>
        </div>

        <div className={styles.heroBody}>
          <div className={styles.identityRow}>
            <div className={styles.avatarWrapper}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={avatarUrl} alt={displayName} className={styles.avatarImage} />
              {verified && (
                <span className={styles.avatarVerifiedBadge} title="Imobiliária Verificada">
                  <CheckCircle2 size={16} />
                </span>
              )}
            </div>

            <div className={styles.heroInfo}>
              <div className={styles.categoryBadgeRow}>
                <span className={styles.categoryPill}>
                  {isBusiness ? "Parceiro Oficial Zhivago" : "Anfitrião Zhivago"}
                </span>
                <AgencyBadge verified={verified} />
              </div>

              <h1 className={styles.agencyName}>{displayName}</h1>

              {displayName !== user.name && (
                <p className={styles.responsible}>
                  <UserCheck size={14} className={styles.metaIcon} />
                  <span>
                    Responsável Técnico: <strong>{user.name}</strong>
                  </span>
                </p>
              )}

              <div className={styles.metaPills}>
                {user.creci && (
                  <span className={styles.metaPill}>
                    <Award size={13} className={styles.metaPillIcon} />
                    CRECI {user.creci}
                  </span>
                )}
                <span className={styles.metaPill}>
                  <CalendarDays size={13} className={styles.metaPillIcon} />
                  No Zhivago desde {memberSince}
                </span>
                <span className={styles.metaPill}>
                  <Building2 size={13} className={styles.metaPillIcon} />
                  {listings.length} {listings.length === 1 ? "imóvel disponível" : "imóveis disponíveis"}
                </span>
              </div>
            </div>

            <div className={styles.ctaGroup}>
              {whatsapp && (
                <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={styles.whatsappButton}>
                  <MessageCircle size={18} />
                  <span>Falar no WhatsApp</span>
                </a>
              )}

              {formattedPhone && (
                <a href={`tel:+55${rawPhone}`} className={styles.phoneButton}>
                  <Phone size={15} />
                  <span>{formattedPhone}</span>
                </a>
              )}
            </div>
          </div>
        </div>

        {/* ── CARDS DE DESTAQUE / MÉTRICAS ── */}
        <section className={styles.metricsGrid} aria-label="Métricas e credenciais">
          <div className={styles.metricCard}>
            <div className={styles.metricCardHeader}>
              <span className={styles.metricLabel}>Portfólio Disponível</span>
              <div className={`${styles.metricIconWrap} ${styles.metricIconAccent}`}>
                <Building2 size={17} />
              </div>
            </div>
            <span className={styles.metricValue}>{listings.length}</span>
            <span className={styles.metricSubtext}>
              {rentalCount > 0 && `${rentalCount} para aluguel`}
              {rentalCount > 0 && saleCount > 0 && " • "}
              {saleCount > 0 && `${saleCount} para venda`}
              {listings.length === 0 && "Nenhum imóvel no momento"}
            </span>
          </div>

          <div className={styles.metricCard}>
            <div className={styles.metricCardHeader}>
              <span className={styles.metricLabel}>Reputação & Avaliação</span>
              <div className={`${styles.metricIconWrap} ${styles.metricIconGold}`}>
                <Star size={17} />
              </div>
            </div>
            <span className={styles.metricValue}>
              {avgRating !== null ? `${avgRating.toLocaleString("pt-BR")} ★` : "5.0 ★"}
            </span>
            <span className={styles.metricSubtext}>
              {reviews.length > 0
                ? `${reviews.length} ${reviews.length === 1 ? "avaliação recebida" : "avaliações recebidas"}`
                : "Parceiro qualificado e auditado"}
            </span>
          </div>

          <div className={styles.metricCard}>
            <div className={styles.metricCardHeader}>
              <span className={styles.metricLabel}>Garantia & Confiança</span>
              <div className={`${styles.metricIconWrap} ${styles.metricIconSuccess}`}>
                <ShieldCheck size={17} />
              </div>
            </div>
            <span className={styles.metricValue}>100% Seguro</span>
            <span className={styles.metricSubtext}>Contratos e reservas intermediadas</span>
          </div>

          <div className={styles.metricCard}>
            <div className={styles.metricCardHeader}>
              <span className={styles.metricLabel}>Histórico na Plataforma</span>
              <div className={`${styles.metricIconWrap} ${styles.metricIconSlate}`}>
                <CalendarDays size={17} />
              </div>
            </div>
            <span className={styles.metricValue}>{memberSince}</span>
            <span className={styles.metricSubtext}>Atendimento direto e credenciado</span>
          </div>
        </section>
      </header>

      {/* ── BANNER INSTITUCIONAL DE SEGURANÇA ── */}
      <div className={styles.trustBanner}>
        <div className={styles.trustIconWrap}>
          <ShieldCheck size={18} />
        </div>
        <p className={styles.trustText}>
          {isBusiness ? (
            <>
              <strong>Vitrine Oficial Verificada:</strong> Todos os imóveis de <strong>{displayName}</strong> são
              gerenciados com exclusividade profissional, transparência jurídica e o selo de garantia Zhivago.
            </>
          ) : (
            <>
              <strong>Reserva Protegida Zhivago:</strong> conversas e reservas com <strong>{displayName}</strong>{" "}
              acontecem direto pela plataforma, seguindo os mesmos padrões de segurança de todo o Zhivago.
            </>
          )}
        </p>
      </div>

      {/* ── SEÇÃO DO CATÁLOGO DE IMÓVEIS ── */}
      <section className={styles.catalogSection} aria-label="Catálogo de Imóveis">
        <div className={styles.catalogHeader}>
          <div className={styles.catalogTitleGroup}>
            <div className={styles.catalogTitleRow}>
              <h2 className={styles.catalogTitle}>Imóveis do Anunciante</h2>
              <span className={styles.catalogCountBadge}>
                {listings.length} {listings.length === 1 ? "imóvel" : "imóveis"}
              </span>
            </div>
            <p className={styles.catalogSubtitle}>
              Filtre por tipo, localização e faixa de preço para encontrar a oportunidade perfeita.
            </p>
          </div>
        </div>

        <ListingsExplorer listings={listings} />
      </section>

      {/* ── SEÇÃO DE AVALIAÇÕES ── */}
      {reviews.length > 0 && (
        <section className={styles.reviewsSection} aria-label="Avaliações de Clientes">
          <div className={styles.reviewsHeader}>
            <div>
              <h2 className={styles.catalogTitle}>Avaliações e Experiências</h2>
              <p className={styles.catalogSubtitle}>O que dizem os clientes que já alugaram ou compraram com esta imobiliária.</p>
            </div>
            <div className={styles.scoreBadge}>
              <Star size={16} className={styles.starFilled} />
              <span>{avgRating}</span>
              <span className={styles.scoreCount}>
                ({reviews.length} {reviews.length === 1 ? "avaliação" : "avaliações"})
              </span>
            </div>
          </div>

          <div className={styles.reviewsGrid}>
            {reviews.map((r) => (
              <article key={r.id} className={styles.reviewCard}>
                <div className={styles.reviewCardHeader}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={
                      r.user.avatar ??
                      `https://ui-avatars.com/api/?name=${encodeURIComponent(r.user.name)}&background=f1f5f9&color=0f172a`
                    }
                    alt={r.user.name}
                    className={styles.reviewAvatar}
                  />
                  <div className={styles.reviewUserInfo}>
                    <p className={styles.reviewUserName}>{r.user.name}</p>
                    <p className={styles.reviewDate}>{formatDate(r.createdAt)}</p>
                  </div>
                </div>

                <div className={styles.reviewRatingRow}>
                  <StarRow rating={r.rating} />
                  <span className={styles.reviewRatingNumber}>{r.rating.toFixed(1)}</span>
                </div>

                {r.comment && <p className={styles.reviewComment}>&ldquo;{r.comment}&rdquo;</p>}

                <div className={styles.reviewListingTag}>
                  <Building2 size={12} />
                  <span>{r.listing.name}</span>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
