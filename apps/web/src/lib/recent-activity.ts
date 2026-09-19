// Histórico local (por navegador) de buscas e imóveis visualizados.
// Usuários autenticados podem futuramente ter isso associado à conta — por ora
// fica em localStorage, não requer nenhuma tabela nova no banco.

const RECENTLY_VIEWED_KEY = "zhivago_recently_viewed";
const RECENT_SEARCHES_KEY = "zhivago_recent_searches";
const MAX_RECENTLY_VIEWED = 8;
const MAX_RECENT_SEARCHES = 5;

function readList(key: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function writeList(key: string, list: string[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(list));
  } catch {
    // storage indisponível (modo privado, cota excedida) — ignora silenciosamente
  }
}

export function getRecentlyViewedIds(): string[] {
  return readList(RECENTLY_VIEWED_KEY);
}

export function recordRecentlyViewed(listingId: string) {
  const next = [listingId, ...readList(RECENTLY_VIEWED_KEY).filter((id) => id !== listingId)].slice(
    0,
    MAX_RECENTLY_VIEWED
  );
  writeList(RECENTLY_VIEWED_KEY, next);
}

export function getRecentSearches(): string[] {
  return readList(RECENT_SEARCHES_KEY);
}

export function addRecentSearch(term: string) {
  const trimmed = term.trim();
  if (trimmed.length < 2) return;
  const next = [trimmed, ...getRecentSearches().filter((item) => item.toLowerCase() !== trimmed.toLowerCase())].slice(
    0,
    MAX_RECENT_SEARCHES
  );
  writeList(RECENT_SEARCHES_KEY, next);
}

export function removeRecentSearch(term: string) {
  writeList(
    RECENT_SEARCHES_KEY,
    getRecentSearches().filter((item) => item !== term)
  );
}
