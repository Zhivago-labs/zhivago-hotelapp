import type { AccountType, Listing } from "@zhivago/shared";

export function getApiUrl(): string {
  return process.env.API_URL ?? "http://localhost:3333";
}

export async function getListings(): Promise<Listing[]> {
  const res = await fetch(`${getApiUrl()}/listings`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Falha ao buscar imóveis (${res.status})`);
  return res.json();
}

/**
 * Imóveis semelhantes calculados no backend (seção 94/95 da spec) — prioriza mesmo empreendimento,
 * bairro, cidade e faixa de preço, e nunca sugere modalidade comercial incompatível. Substitui o
 * antigo cálculo client-side que trazia a listagem inteira e filtrava só por category/type/preço.
 */
export async function getSimilarListings(id: string): Promise<Listing[]> {
  const res = await fetch(`${getApiUrl()}/listings/${id}/similar`, { cache: "no-store" });
  if (!res.ok) return [];
  return res.json();
}

export interface AgencyProfileUser {
  id: string;
  name: string;
  avatar: string | null;
  phone: string | null;
  createdAt: string;
  accountType: AccountType;
  companyName: string | null;
  creci: string | null;
  verified: boolean;
}

export interface AgencyProfileReview {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  user: { name: string; avatar: string | null };
  listing: { id: string; name: string };
}

export interface AgencyProfile {
  user: AgencyProfileUser;
  // Presente quando o usuário do perfil pertence a uma organização (B2B) — nesse caso o portfólio
  // exibido já é o da organização inteira, não só o que esse membro criou.
  organization: { id: string; name: string; logo: string | null; verified: boolean } | null;
  listings: Listing[];
  reviews: AgencyProfileReview[];
}

export async function getAgencyProfile(id: string): Promise<AgencyProfile | null> {
  const res = await fetch(`${getApiUrl()}/users/${id}`, { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Falha ao buscar perfil (${res.status})`);
  return res.json();
}

/**
 * `token` é opcional (visitante anônimo vendo um anúncio público não tem um) — mas sem ele o
 * backend nunca reconhece o dono, então rascunho/pendente sempre 404 mesmo pro próprio dono
 * (`getListingById` só libera status não-público pra quem autentica como dono/admin). A tela de
 * edição SEMPRE precisa passar o token; a página pública de detalhe pode continuar sem.
 */
export async function getListing(id: string, token?: string): Promise<Listing | null> {
  const res = await fetch(`${getApiUrl()}/listings/${id}`, {
    cache: "no-store",
    ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Falha ao buscar imóvel (${res.status})`);
  return res.json();
}

export function formatPrice(listing: Listing): string {
  const value = listing.price.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
  if (listing.category === "aluguel") {
    return `${value} / ${listing.billingCycle ?? "noite"}`;
  }
  return value;
}
