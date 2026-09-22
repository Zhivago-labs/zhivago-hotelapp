import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, CalendarRange, MessageCircle } from "lucide-react";
import { getListing, getSimilarListings, formatPrice } from "@/lib/api";
import { getSessionUser } from "@/lib/session";
import { StartChatButton } from "@/components/chat/StartChatButton";
import { BookingRequestForm } from "@/components/listing/BookingRequestForm";
import { MobileRentTrigger } from "@/components/listing/MobileRentTrigger";
import { ListingGallery } from "@/components/listing/ListingGallery";
import { ListingCard } from "@/components/ListingCard";
import { AgencyBadge } from "@/components/AgencyBadge";
import { FavoriteButton } from "@/components/favorites/FavoriteButton";
import { ListingReviews } from "@/components/listing/ListingReviews";
import { ListingHighlights } from "@/components/listing/ListingHighlights";
import { ListingDescriptionSection } from "@/components/listing/ListingDescriptionSection";
import { CommercialConditionsPanel } from "@/components/listing/CommercialConditionsPanel";
import { PropertyMap } from "@/components/listing/PropertyMap";
import { HostCard } from "@/components/listing/HostCard";
import { HouseRules } from "@/components/listing/HouseRules";
import { RecordRecentView } from "@/components/listing/RecordRecentView";
import styles from "./page.module.css";

type Params = { params: Promise<{ id: string }> };

// Seção 133/134 da spec: nunca um CTA universal — cada modalidade fala de um jeito diferente.
function ctaLabel(operationType: string): string {
  if (operationType === "DAILY_RENT") return "Solicitar reserva";
  return "Tenho interesse";
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const listing = await getListing(id);
  if (!listing) return { title: "Imóvel não encontrado" };

  const title = `${listing.name} — ${listing.location}`;
  const description = listing.description ?? `${formatPrice(listing)} em ${listing.location}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: listing.images[0] ? [{ url: listing.images[0].url }] : undefined,
    },
  };
}

function whatsAppLink(listing: NonNullable<Awaited<ReturnType<typeof getListing>>>): string | null {
  if (!listing.owner?.phone) return null;
  const phone = listing.owner.phone.replace(/\D/g, "");
  const message = `Olá ${listing.owner.name}, tenho interesse no imóvel "${listing.name}"!`;
  return `https://wa.me/55${phone}?text=${encodeURIComponent(message)}`;
}

export default async function ListingPage({ params }: Params) {
  const { id } = await params;
  const listing = await getListing(id);

  if (!listing) notFound();

  // Calculado no backend agora (seção 94/95 da spec) — prioriza mesmo empreendimento, bairro,
  // cidade e faixa de preço, nunca sugere modalidade comercial incompatível.
  const similarListings = await getSimilarListings(listing.id);

  const whatsapp = whatsAppLink(listing);
  const user = await getSessionUser();
  const isOwner = user?.id === listing.owner?.id || (!!listing.agentId && user?.id === listing.agentId);

  // Imóvel de organização (B2B) não tem `owner` (fica null) — o "anunciante" público é a própria
  // organização, representada pelo corretor responsável (`agent`) como contato/link de perfil.
  // A vitrine em /imobiliaria/[id] vale pra qualquer dono (imobiliária ou anfitrião pessoa física).
  const advertiser = listing.owner
    ? {
        id: listing.owner.id,
        name: listing.owner.name,
        avatar: listing.owner.avatar,
        companyName: listing.owner.companyName,
        verified: listing.owner.accountType === "AGENCY" && (listing.owner.verified ?? false),
        profileHref: `/imobiliaria/${listing.owner.id}`,
      }
    : listing.organization && listing.agent
      ? {
          id: listing.agent.id,
          name: listing.organization.name,
          avatar: listing.organization.logo ?? listing.agent.avatar,
          companyName: listing.organization.name,
          verified: listing.organization.verified,
          profileHref: `/imobiliaria/${listing.agent.id}`,
        }
      : null;

  const isOrgListing = !!listing.organizationId;

  const hasDiscount = Boolean(
    listing.originalPrice && Number(listing.originalPrice) > listing.price
  );
  const discountPercent = hasDiscount
    ? Math.round(((Number(listing.originalPrice) - listing.price) / Number(listing.originalPrice)) * 100)
    : 0;

  // Contas de imobiliária só enxergam o próprio inventário — qualquer anúncio de
  // outro dono é bloqueado, mesmo por link direto.
  if (user?.accountType === "AGENCY" && user.role !== "ADMIN" && !isOwner) {
    redirect("/dashboard");
  }

  return (
    <main className={styles.main}>
      <RecordRecentView listingId={listing.id} />

      <div className={styles.gallerySection}>
        <ListingGallery images={listing.images} alt={listing.name}>
          <Link href="/imoveis" className={styles.backButton} aria-label="Voltar">
            <ArrowLeft size={20} />
          </Link>
          {listing.status === "SOLD" && <span className={styles.soldBadge}>VENDIDO</span>}
        </ListingGallery>
      </div>

      <div className={styles.contentGrid}>
        <div className={styles.mainContent}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem" }}>
            <div>
              <h1 className={styles.name}>{listing.name}</h1>
              <p className={styles.subtitleSpecs}>
                <span>{listing.type === "casa" ? "Casa" : "Apartamento"} em {listing.location}</span>
                {/* Seção 86/87 da spec: hóspedes só existem de verdade em DAILY_RENT, a partir de
                    customMaxGuests real — nunca `bedrooms * 2`. "Camas" nunca existiu como dado
                    real (`bedrooms + 1` era inventado) — removido, não há `bedCount` no modelo. */}
                {listing.operationType === "DAILY_RENT" && listing.customMaxGuests != null && (
                  <>
                    <span className={styles.bulletDot} />
                    <span>{listing.customMaxGuests} hóspedes</span>
                  </>
                )}
                <span className={styles.bulletDot} />
                <span>{listing.bedrooms} quartos</span>
                {listing.suites != null && listing.suites > 0 && (
                  <>
                    <span className={styles.bulletDot} />
                    <span>{listing.suites} {listing.suites === 1 ? "suíte" : "suítes"}</span>
                  </>
                )}
                <span className={styles.bulletDot} />
                <span>{listing.bathrooms} banheiros</span>
                {listing.totalArea != null && (
                  <>
                    <span className={styles.bulletDot} />
                    <span>{listing.totalArea} m²</span>
                  </>
                )}
              </p>
            </div>
            <FavoriteButton listingId={listing.id} size={22} />
          </div>

          {advertiser && (
            <>
              <hr className={styles.divider} />
              <div className={styles.ownerCard}>
                <div className={styles.ownerAvatar}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={
                      advertiser.avatar ??
                      `https://ui-avatars.com/api/?name=${encodeURIComponent(advertiser.name)}&background=f0f0f0`
                    }
                    alt={advertiser.name}
                  />
                </div>
                <div className={styles.ownerInfo}>
                  <span style={{ fontWeight: 750, fontSize: "15px" }}>
                    {/* Seção 89 da spec: "Anfitrião" só faz sentido pra diária de pessoa física —
                        organização (venda/mensal/imobiliária) usa "Anunciado por"/"Corretor responsável". */}
                    {isOrgListing
                      ? "Anunciado por"
                      : listing.operationType === "DAILY_RENT"
                        ? "Anfitrião"
                        : "Anunciado por"}
                    :{" "}
                    {advertiser.profileHref ? (
                      <Link href={advertiser.profileHref} className={styles.ownerLink}>
                        {advertiser.companyName || advertiser.name}
                      </Link>
                    ) : (
                      advertiser.name
                    )}
                  </span>
                  {isOrgListing && listing.agent && (
                    <span style={{ fontSize: "13px", color: "var(--muted)", fontWeight: 500 }}>
                      Corretor responsável: {listing.agent.name}
                    </span>
                  )}
                  <AgencyBadge verified={advertiser.verified} />
                </div>
              </div>
            </>
          )}

          {/* Destaques do Anúncio — só o que é dado real (seção 88) */}
          <ListingHighlights location={listing.location} amenities={listing.amenities} />

          {/* Seção Sobre este espaço + Comodidades + Modal */}
          <ListingDescriptionSection
            description={listing.description}
            bedrooms={listing.bedrooms}
            bathrooms={listing.bathrooms}
            parking={listing.parking}
            type={listing.type}
            location={listing.location}
            amenities={listing.amenities}
          />

          {/* Condições específicas de VENDA/MENSAL (seção 66/67/83/84) */}
          <CommercialConditionsPanel listing={listing} />

          {/* Avaliações */}
          <ListingReviews listingId={id} category={listing.category} user={user} />

          {/* Integração com Mapa ("Onde você estará") */}
          <PropertyMap location={listing.location} />

          {/* Anfitrião Detalhado */}
          {advertiser && <HostCard owner={advertiser} isOrganization={isOrgListing} />}

          {/* Regras e Segurança — conceito exclusivo de hospedagem por diária (seção 66/67) */}
          {listing.operationType === "DAILY_RENT" && <HouseRules listing={listing} />}
        </div>

        <aside className={styles.sidebar}>
          <div className={styles.stickyCard}>
            <div className={styles.priceSection}>
              <span className={styles.priceLabel}>Preço do imóvel</span>
              {hasDiscount && (
                <span className={styles.oldPriceDetail}>
                  {Number(listing.originalPrice).toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                    maximumFractionDigits: 0,
                  })}
                </span>
              )}
              <p className={styles.priceValue}>
                {formatPrice(listing).split(" / ")[0]}
                {hasDiscount && (
                  <span className={styles.discountBadgeDetail}>{discountPercent}% OFF</span>
                )}
              </p>
              {listing.operationType !== "SALE" && (
                <p className={styles.priceSuffix}>/ {listing.operationType === "MONTHLY_RENT" ? "mês" : "noite"}</p>
              )}
            </div>

            <div className={styles.sidebarActions}>
              {whatsapp && (
                <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={styles.whatsappButton}>
                  Falar no WhatsApp
                </a>
              )}
              {/* Venda/mensal: CTA de chat direto (seção 133/134 — "Tenho interesse", nunca um
                  rótulo genérico universal). Diária: sem chat solto aqui, o próprio formulário de
                  reserva abaixo já abre o chat ao confirmar as datas. */}
              {listing.operationType !== "DAILY_RENT" && (
                !user ? (
                  <Link href={`/login?next=/imovel/${id}`} className={styles.chatButtonLink}>
                    <MessageCircle size={18} />
                    Entrar para conversar
                  </Link>
                ) : isOwner ? null : listing.status === "SOLD" ? (
                  <span className={styles.chatButtonDisabled} title="Este imóvel já foi vendido">
                    <MessageCircle size={18} />
                    Chat (Vendido)
                  </span>
                ) : (
                  <StartChatButton listingId={listing.id} label={ctaLabel(listing.operationType)} />
                )
              )}
              {!user && listing.operationType === "DAILY_RENT" && (
                <Link href={`/login?next=/imovel/${id}`} className={styles.chatButtonLink}>
                  <MessageCircle size={18} />
                  Entrar para reservar e conversar
                </Link>
              )}
            </div>

            {user &&
              user.role !== "ADMIN" &&
              !isOwner &&
              listing.operationType === "DAILY_RENT" &&
              listing.status === "APPROVED" && <BookingRequestForm listingId={listing.id} />}
          </div>
        </aside>
      </div>

      {similarListings.length > 0 && (
        <section className={styles.similarSection}>
          <h2 className={styles.similarTitle}>Imóveis semelhantes</h2>
          <div className={styles.similarGrid}>
            {similarListings.map((item) => (
              <ListingCard key={item.id} listing={item} />
            ))}
          </div>
        </section>
      )}

      <div className={styles.footer}>
        <div>
          <p className={styles.priceValue}>{formatPrice(listing).split(" / ")[0]}</p>
          {listing.operationType !== "SALE" && (
            <p className={styles.priceSuffix}>/ {listing.operationType === "MONTHLY_RENT" ? "mês" : "noite"}</p>
          )}
        </div>
        <div className={styles.footerActions}>
          {whatsapp && (
            <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={styles.whatsappButton}>
              WhatsApp
            </a>
          )}
          {listing.operationType !== "DAILY_RENT" && (
            !user ? (
              <Link href={`/login?next=/imovel/${id}`} className={styles.chatButtonDisabled}>
                <MessageCircle size={18} />
                {ctaLabel(listing.operationType)}
              </Link>
            ) : isOwner ? null : listing.status === "SOLD" ? (
              <span className={styles.chatButtonDisabled} title="Este imóvel já foi vendido">
                <MessageCircle size={18} />
                Chat (Vendido)
              </span>
            ) : (
              <StartChatButton listingId={listing.id} label={ctaLabel(listing.operationType)} />
            )
          )}
          {listing.operationType === "DAILY_RENT" && (
            !user ? (
              <Link href={`/login?next=/imovel/${id}`} className={styles.chatButtonDisabled}>
                <CalendarRange size={18} />
                Solicitar reserva
              </Link>
            ) : isOwner ? null : listing.status === "APPROVED" ? (
              <MobileRentTrigger listingId={listing.id} />
            ) : null
          )}
        </div>
      </div>
    </main>
  );
}
