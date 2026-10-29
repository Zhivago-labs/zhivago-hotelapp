import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import {
  ArrowLeft,
  ArrowRight,
  Bath,
  BedDouble,
  Building2,
  CalendarClock,
  CalendarRange,
  Car,
  Check,
  ExternalLink,
  Handshake,
  House,
  Landmark,
  MapPin,
  MessageCircle,
  Phone,
  Receipt,
  Repeat,
  ShieldCheck,
  ShowerHead,
  Sparkles,
  Tag,
  Users,
} from "lucide-react";
import type { Listing } from "@zhivago/shared";
import { getListing, getSimilarListings, formatPrice } from "@/lib/api";
import { getSessionUser } from "@/lib/session";
import { StartChatButton } from "@/components/chat/StartChatButton";
import { BookingRequestForm } from "@/components/listing/BookingRequestForm";
import { MobileRentTrigger } from "@/components/listing/MobileRentTrigger";
import { ListingGallery } from "@/components/listing/ListingGallery";
import { ListingTabs } from "@/components/listing/ListingTabs";
import { ListingAbout, ListingAmenities } from "@/components/listing/ListingOverview";
import { FavoriteButton } from "@/components/favorites/FavoriteButton";
import { ListingReviews } from "@/components/listing/ListingReviews";
import { HouseRules } from "@/components/listing/HouseRules";
import { RecordRecentView } from "@/components/listing/RecordRecentView";
import styles from "./page.module.css";

type Params = { params: Promise<{ id: string }> };
type Row = { icon: typeof Building2; label: string; value: string };

const OPERATION_BADGE: Record<string, string> = {
  SALE: "À venda",
  MONTHLY_RENT: "Aluguel",
  DAILY_RENT: "Temporada",
};

const CONDITIONS_TITLE: Record<string, string> = {
  SALE: "Condições da venda",
  MONTHLY_RENT: "Condições do aluguel",
  DAILY_RENT: "Condições da estadia",
};

const GUARANTEE_LABELS: Record<string, string> = {
  CAUCAO: "Caução",
  SEGURO_FIANCA: "Seguro-fiança",
  FIADOR: "Fiador",
};

function brl(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function parseGuaranteeTypes(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function compact<T>(items: (T | false | null | undefined)[]): T[] {
  return items.filter((item): item is T => Boolean(item));
}

/** Condições comerciais — só o que existe de verdade no anúncio, por modalidade (seções 66/67). */
function conditionRows(listing: Listing): Row[] {
  if (listing.operationType === "SALE") {
    return compact<Row>([
      { icon: Tag, label: "Valor do imóvel", value: brl(listing.price) },
      listing.condoFee != null && { icon: Building2, label: "Condomínio", value: `${brl(listing.condoFee)}/mês` },
      listing.iptuAnnual != null && { icon: Receipt, label: "IPTU", value: `${brl(listing.iptuAnnual)}/ano` },
      listing.acceptsFinancing != null && {
        icon: Landmark,
        label: "Financiamento",
        value: listing.acceptsFinancing ? "Aceita" : "Não aceita",
      },
      listing.acceptsExchange != null && {
        icon: Repeat,
        label: "Permuta",
        value: listing.acceptsExchange ? "Estuda proposta" : "Não aceita",
      },
      listing.acceptsNegotiation && { icon: Handshake, label: "Negociação", value: "Aceita negociar pelo chat" },
    ]);
  }

  if (listing.operationType === "MONTHLY_RENT") {
    const guarantees = parseGuaranteeTypes(listing.guaranteeTypes);
    return compact<Row>([
      { icon: Tag, label: "Aluguel", value: `${brl(listing.price)}/mês` },
      listing.condoFee != null && { icon: Building2, label: "Condomínio", value: `${brl(listing.condoFee)}/mês` },
      listing.iptuMonthly != null && { icon: Receipt, label: "IPTU", value: `${brl(listing.iptuMonthly)}/mês` },
      !!listing.availableFrom && {
        icon: CalendarClock,
        label: "Disponível a partir de",
        value: new Date(listing.availableFrom).toLocaleDateString("pt-BR"),
      },
      listing.minimumLeaseMonths != null && {
        icon: CalendarClock,
        label: "Prazo mínimo",
        value: plural(listing.minimumLeaseMonths, "mês", "meses"),
      },
      guarantees.length > 0 && {
        icon: Landmark,
        label: "Garantias",
        value: guarantees.map((g) => GUARANTEE_LABELS[g] ?? g).join(", "),
      },
      listing.acceptsNegotiation && { icon: Handshake, label: "Negociação", value: "Aceita negociar pelo chat" },
    ]);
  }

  return compact<Row>([
    { icon: Tag, label: "Diária", value: brl(listing.price) },
    listing.cleaningFee != null && { icon: Sparkles, label: "Taxa de limpeza", value: brl(listing.cleaningFee) },
    listing.minimumNights != null && {
      icon: CalendarClock,
      label: "Estadia mínima",
      value: plural(listing.minimumNights, "noite", "noites"),
    },
    listing.customMaxGuests != null && {
      icon: Users,
      label: "Hóspedes",
      value: `Até ${listing.customMaxGuests}`,
    },
  ]);
}

/** Destaques do imóvel — derivados só de campos reais do anúncio (seção 88: nada inventado). */
function highlights(listing: Listing): string[] {
  const area = listing.privateArea ?? listing.totalArea;
  return compact<string>([
    (listing.suites ?? 0) > 0 && plural(listing.suites!, "suíte", "suítes"),
    listing.parking > 0 && `Garagem para ${plural(listing.parking, "carro", "carros")}`,
    area != null && `${listing.privateArea != null ? "Área privativa" : "Área total"} de ${area} m²`,
    listing.privateArea != null && listing.totalArea != null && `Área total de ${listing.totalArea} m²`,
    listing.operationType === "DAILY_RENT" &&
      listing.customMaxGuests != null &&
      `Acomoda até ${plural(listing.customMaxGuests, "hóspede", "hóspedes")}`,
    listing.isFurnished && "Mobiliado",
    listing.operationType === "MONTHLY_RENT" && listing.allowPets && "Aceita animais de estimação",
    listing.operationType === "SALE" && listing.acceptsFinancing && "Aceita financiamento",
    listing.operationType === "SALE" && listing.acceptsExchange && "Aceita permuta",
    listing.acceptsNegotiation && "Valor negociável pelo chat",
  ]);
}

function addressLines(listing: Listing): [string, string | null] {
  const street = compact<string>([
    listing.logradouro && [listing.logradouro, listing.numero].filter(Boolean).join(", "),
    listing.complemento,
    listing.bairro,
  ]).join(" - ");
  const city = compact<string>([
    [listing.cidade, listing.uf].filter(Boolean).join(" - "),
    listing.cep,
  ]).join(", ");
  if (!street && !city) return [listing.location, null];
  return street ? [street, city || null] : [city, null];
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

function whatsAppLink(listing: Listing): string | null {
  if (!listing.owner?.phone) return null;
  const phone = listing.owner.phone.replace(/\D/g, "");
  const message = `Olá ${listing.owner.name}, tenho interesse no imóvel "${listing.name}"!`;
  return `https://wa.me/55${phone}?text=${encodeURIComponent(message)}`;
}

export default async function ListingPage({ params }: Params) {
  const { id } = await params;
  const listing = await getListing(id);

  if (!listing) notFound();

  // Calculado no backend (seção 94/95 da spec) — prioriza mesmo empreendimento, bairro, cidade e
  // faixa de preço, nunca sugere modalidade comercial incompatível.
  const similarListings = await getSimilarListings(listing.id);

  const whatsapp = whatsAppLink(listing);
  const user = await getSessionUser();
  const isOwner = user?.id === listing.owner?.id || (!!listing.agentId && user?.id === listing.agentId);

  // Imóvel de organização (B2B) não tem `owner` (fica null) — o "anunciante" público é a própria
  // organização, representada pelo corretor responsável (`agent`) como contato/link de perfil.
  const advertiser = listing.owner
    ? {
        name: listing.owner.companyName || listing.owner.name,
        avatar: listing.owner.avatar,
        isAgency: listing.owner.accountType === "AGENCY",
        verified: listing.owner.verified ?? false,
        profileHref: `/imobiliaria/${listing.owner.id}`,
      }
    : listing.organization && listing.agent
      ? {
          name: listing.organization.name,
          avatar: listing.organization.logo ?? listing.agent.avatar,
          isAgency: true,
          verified: listing.organization.verified,
          profileHref: `/imobiliaria/${listing.agent.id}`,
        }
      : null;

  // Contas de imobiliária só enxergam o próprio inventário — qualquer anúncio de
  // outro dono é bloqueado, mesmo por link direto.
  if (user?.accountType === "AGENCY" && user.role !== "ADMIN" && !isOwner) {
    redirect("/dashboard");
  }

  const hasDiscount = Boolean(listing.originalPrice && Number(listing.originalPrice) > listing.price);
  const discountPercent = hasDiscount
    ? Math.round(((Number(listing.originalPrice) - listing.price) / Number(listing.originalPrice)) * 100)
    : 0;
  const priceSuffix =
    listing.operationType === "MONTHLY_RENT" ? "/mês" : listing.operationType === "DAILY_RENT" ? "/noite" : "";

  // Vendido/alugado: some das listas públicas, mas o link direto ainda abre com o selo.
  const closedLabel = listing.status === "SOLD" ? "Vendido" : listing.status === "RENTED" ? "Alugado" : null;
  const isDaily = listing.operationType === "DAILY_RENT";

  const place = listing.cidade ? [listing.cidade, listing.uf].filter(Boolean).join(", ") : listing.location;
  const area = listing.privateArea ?? listing.totalArea;
  const specs = compact<{ icon: typeof BedDouble; text: string }>([
    { icon: BedDouble, text: plural(listing.bedrooms, "quarto", "quartos") },
    (listing.suites ?? 0) > 0 && { icon: ShowerHead, text: plural(listing.suites!, "suíte", "suítes") },
    { icon: Bath, text: plural(listing.bathrooms, "banheiro", "banheiros") },
    area != null && { icon: House, text: `${area} m²` },
    listing.parking > 0 && { icon: Car, text: plural(listing.parking, "vaga", "vagas") },
  ]);

  const conditions = conditionRows(listing);
  const highlightItems = highlights(listing);
  const [addressLine, cityLine] = addressLines(listing);
  const mapQuery = encodeURIComponent([addressLine, cityLine].filter(Boolean).join(", "));
  const iptu = listing.operationType === "SALE" ? listing.iptuAnnual : listing.iptuMonthly;

  const tabs = compact<{ id: string; label: string }>([
    { id: "visao-geral", label: "Visão geral" },
    Boolean(listing.amenities) && { id: "diferenciais", label: "Diferenciais" },
    conditions.length > 0 && { id: "condicoes", label: CONDITIONS_TITLE[listing.operationType] },
    { id: "localizacao", label: "Localização" },
    advertiser && { id: "anunciante", label: "Anunciante" },
  ]);

  // CTA principal do card de preço: diária reserva pelo formulário (que já abre o chat); venda e
  // mensal abrem a conversa direto.
  const contactCta = !user ? (
    <Link href={`/login?next=/imovel/${id}`} className={styles.primaryButton}>
      {isDaily ? <CalendarRange size={18} /> : <MessageCircle size={18} />}
      {isDaily ? "Entrar para reservar" : "Entrar em contato"}
    </Link>
  ) : isOwner || user.role === "ADMIN" ? null : closedLabel ? (
    <span className={styles.disabledButton} title={`Este imóvel já foi ${closedLabel.toLowerCase()}`}>
      <MessageCircle size={18} />
      Imóvel {closedLabel.toLowerCase()}
    </span>
  ) : isDaily ? (
    listing.status === "APPROVED" && <BookingRequestForm listingId={listing.id} />
  ) : (
    <div className={styles.chatCta}>
      <StartChatButton listingId={listing.id} label="Entrar em contato" />
    </div>
  );

  return (
    <main className={styles.main}>
      <RecordRecentView listingId={listing.id} />

      <div className={styles.layout}>
        <div className={styles.content}>
          <Link href="/imoveis" className={styles.backLink}>
            <ArrowLeft size={16} />
            Voltar para a busca
          </Link>

          <ListingGallery images={listing.images} alt={listing.name}>
            {closedLabel && <span className={styles.closedBadge}>{closedLabel.toUpperCase()}</span>}
          </ListingGallery>

          <header className={styles.header}>
            <p className={styles.place}>
              <MapPin size={17} />
              {place}
            </p>
            <h1 className={styles.title}>{listing.name}</h1>
          </header>

          <ul className={styles.specs}>
            {specs.map((spec) => (
              <li key={spec.text} className={styles.spec}>
                <spec.icon size={22} strokeWidth={1.5} />
                {spec.text}
              </li>
            ))}
          </ul>

          <section className={styles.panel}>
            <ListingTabs tabs={tabs} />

            <div className={styles.overview} id="visao-geral">
              <div className={styles.overviewMain}>
                <ListingAbout description={listing.description} />

                {highlightItems.length > 0 && (
                  <div className={styles.highlights}>
                    <h3 className={styles.boxTitle}>Destaques do imóvel</h3>
                    <ul className={styles.highlightList}>
                      {highlightItems.map((item) => (
                        <li key={item}>
                          <Check size={15} />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <div className={styles.overviewSide}>
                <ListingAmenities amenities={listing.amenities} />

                {conditions.length > 0 && (
                  <div className={styles.box} id="condicoes">
                    <h3 className={styles.boxTitle}>{CONDITIONS_TITLE[listing.operationType]}</h3>
                    <ul className={styles.conditionGrid}>
                      {conditions.map((row) => (
                        <li key={row.label} className={styles.condition}>
                          <row.icon size={17} strokeWidth={1.6} />
                          <span>
                            <span className={styles.conditionLabel}>{row.label}</span>
                            <span className={styles.conditionValue}>{row.value}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Avaliações e regras da casa: conceitos de aluguel/hospedagem */}
          <ListingReviews listingId={id} category={listing.category} user={user} />
          {isDaily && <HouseRules listing={listing} />}
        </div>

        <aside className={styles.sidebar}>
          {/* ── Preço e contato ── */}
          <div className={styles.card}>
            <span className={`${styles.operationBadge} ${closedLabel ? styles.operationBadgeClosed : ""}`}>
              {closedLabel ?? OPERATION_BADGE[listing.operationType]}
            </span>

            {hasDiscount && <p className={styles.oldPrice}>{brl(Number(listing.originalPrice))}</p>}
            <p className={styles.price}>
              {brl(listing.price)}
              {priceSuffix && <span className={styles.priceSuffix}>{priceSuffix}</span>}
              {hasDiscount && <span className={styles.discountBadge}>{discountPercent}% de desconto</span>}
            </p>

            {(listing.condoFee != null || iptu != null) && (
              <ul className={styles.fees}>
                {listing.condoFee != null && (
                  <li>
                    <Building2 size={16} strokeWidth={1.6} />
                    Condomínio: {brl(listing.condoFee)}/mês
                  </li>
                )}
                {iptu != null && (
                  <li>
                    <Receipt size={16} strokeWidth={1.6} />
                    IPTU: {brl(iptu)}/{listing.operationType === "SALE" ? "ano" : "mês"}
                  </li>
                )}
              </ul>
            )}

            <div className={styles.cardActions}>
              {contactCta}
              <FavoriteButton listingId={listing.id} size={18} label="Favoritar" />
            </div>

            {advertiser?.verified && (
              <div className={styles.verified}>
                <ShieldCheck size={18} />
                <div>
                  <strong>Anúncio verificado</strong>
                  <p>Anunciante com cadastro verificado pela Zhivago.</p>
                </div>
              </div>
            )}
          </div>

          {/* ── Anunciante ── */}
          {advertiser && (
            <div className={styles.card} id="anunciante">
              <div className={styles.advertiser}>
                {advertiser.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={advertiser.avatar} alt={advertiser.name} className={styles.avatar} />
                ) : (
                  <span className={styles.avatarInitial}>{advertiser.name.charAt(0).toUpperCase()}</span>
                )}
                <div className={styles.advertiserInfo}>
                  <span className={styles.advertiserName}>{advertiser.name}</span>
                  {listing.organization && listing.agent && (
                    <span className={styles.agentName}>Corretor: {listing.agent.name}</span>
                  )}
                  {advertiser.verified && (
                    <span className={styles.verifiedPill}>
                      <ShieldCheck size={12} />
                      {advertiser.isAgency ? "Imobiliária verificada" : "Conta verificada"}
                    </span>
                  )}
                </div>
              </div>

              <Link href={advertiser.profileHref} className={styles.profileButton}>
                {advertiser.isAgency ? "Ver perfil da imobiliária" : "Ver perfil do anunciante"}
                <ArrowRight size={16} />
              </Link>

              {listing.owner?.phone && (
                <div className={styles.phoneList}>
                  <a href={`tel:+55${listing.owner.phone.replace(/\D/g, "")}`} className={styles.phoneRow}>
                    <Phone size={17} />
                    <span>{listing.owner.phone}</span>
                    <span className={styles.phoneAction}>Ligar</span>
                  </a>
                  {whatsapp && (
                    <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={styles.phoneRow}>
                      <MessageCircle size={17} />
                      <span>{listing.owner.phone}</span>
                      <span className={styles.phoneAction}>WhatsApp</span>
                    </a>
                  )}
                </div>
              )}

              <p className={styles.terms}>
                Ao entrar em contato, você concorda com os <Link href="/termos">Termos de Uso</Link> e a{" "}
                <Link href="/privacidade">Política de Privacidade</Link>.
              </p>
            </div>
          )}

          {/* ── Localização ── */}
          <div className={styles.card} id="localizacao">
            <h3 className={styles.cardTitle}>Localização</h3>
            <p className={styles.address}>
              <MapPin size={15} />
              <span>
                {addressLine}
                {cityLine && (
                  <>
                    <br />
                    {cityLine}
                  </>
                )}
              </span>
            </p>
            <iframe
              title={`Mapa de ${listing.location}`}
              src={`https://maps.google.com/maps?q=${mapQuery}&t=&z=14&ie=UTF8&iwloc=&output=embed`}
              className={styles.map}
              loading="lazy"
            />
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${mapQuery}`}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.mapButton}
            >
              Ver no mapa
              <ExternalLink size={14} />
            </a>
          </div>

          {/* ── Imóveis semelhantes ── */}
          {similarListings.length > 0 && (
            <div className={styles.card}>
              <div className={styles.cardTitleRow}>
                <h3 className={styles.cardTitle}>Imóveis semelhantes</h3>
                <Link href="/imoveis" className={styles.seeAll}>
                  Ver todos
                </Link>
              </div>
              <div className={styles.similarRow}>
                {similarListings.map((item) => {
                  const itemArea = item.privateArea ?? item.totalArea;
                  return (
                    <Link key={item.id} href={`/imovel/${item.id}`} className={styles.similarCard}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={item.images[0]?.url} alt={item.name} className={styles.similarImg} />
                      <span className={styles.similarPrice}>{formatPrice(item)}</span>
                      <span className={styles.similarName}>{item.name}</span>
                      <span className={styles.similarSpecs}>
                        <span>
                          <BedDouble size={12} /> {item.bedrooms}
                        </span>
                        <span>
                          <Bath size={12} /> {item.bathrooms}
                        </span>
                        {itemArea != null && (
                          <span>
                            <House size={12} /> {itemArea} m²
                          </span>
                        )}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </aside>
      </div>

      {/* Barra fixa no celular: preço + ação principal */}
      <div className={styles.footer}>
        <div>
          <p className={styles.footerPrice}>
            {brl(listing.price)}
            {priceSuffix && <span className={styles.priceSuffix}>{priceSuffix}</span>}
          </p>
        </div>
        <div className={styles.footerActions}>
          {whatsapp && (
            <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={styles.whatsappButton}>
              WhatsApp
            </a>
          )}
          {!user ? (
            <Link href={`/login?next=/imovel/${id}`} className={styles.footerButton}>
              {isDaily ? "Reservar" : "Contato"}
            </Link>
          ) : isOwner ? null : closedLabel ? (
            <span className={styles.disabledButton}>Imóvel {closedLabel.toLowerCase()}</span>
          ) : isDaily ? (
            listing.status === "APPROVED" && <MobileRentTrigger listingId={listing.id} />
          ) : (
            <StartChatButton listingId={listing.id} label="Contato" />
          )}
        </div>
      </div>
    </main>
  );
}
