import type { Listing } from "@zhivago/shared";

export interface CitySummary {
  /** Texto exibido, ex.: "Ipatinga - MG". */
  label: string;
  /** Termo enviado como ?q= para o /imoveis (casa com o campo cidade do anúncio). */
  query: string;
  count: number;
}

interface Place {
  cidade?: string;
  uf?: string;
  bairro?: string;
}

/**
 * Cidade/UF/bairro do anúncio. Usa os campos estruturados; anúncios antigos só têm o texto livre
 * no formato do cadastro ("Rua X, 53 - Bairro - Cidade, UF") — aí lê os dois últimos trechos.
 */
function placeOf(listing: Listing): Place {
  if (listing.cidade?.trim()) {
    return { cidade: listing.cidade.trim(), uf: listing.uf?.trim(), bairro: listing.bairro?.trim() };
  }
  const segments = listing.location.split(" - ").map((part) => part.trim());
  if (segments.length < 3) return {};
  const [cidade, uf] = segments[segments.length - 1].split(",").map((part) => part.trim());
  return { cidade: cidade || undefined, uf: uf || undefined, bairro: segments[segments.length - 2] || undefined };
}

/** Cidades com anúncios publicados, contadas a partir do inventário real (sem números inventados). */
export function citySummaries(listings: Listing[]): CitySummary[] {
  const byCity = new Map<string, CitySummary>();
  for (const listing of listings) {
    const place = placeOf(listing);
    const city = place.cidade;
    if (!city) continue;
    const key = city.toLowerCase();
    const current = byCity.get(key);
    if (current) {
      current.count += 1;
    } else {
      const uf = place.uf;
      byCity.set(key, { label: uf ? `${city} - ${uf}` : city, query: city, count: 1 });
    }
  }
  return Array.from(byCity.values()).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/** Sugestões do campo "Onde" do hero: cidades e bairros reais — nunca endereços completos. */
export function locationSuggestions(listings: Listing[], limit = 20): string[] {
  const seen = new Set<string>();
  const suggestions: string[] = [];
  for (const value of listings.flatMap((listing) => {
    const place = placeOf(listing);
    return [place.cidade, place.bairro];
  })) {
    const text = value?.trim();
    if (!text || seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    suggestions.push(text);
  }
  return suggestions.slice(0, limit);
}

// Critério de relevância: contagem de visualizações com desempate por mais recente
export function byRelevance(a: Listing, b: Listing): number {
  if (b.viewCount !== a.viewCount) return b.viewCount - a.viewCount;
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}
