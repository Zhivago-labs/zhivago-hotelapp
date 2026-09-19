"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Search,
  Home,
  Building2,
  X,
  SlidersHorizontal,
  BedDouble,
  Bath,
  Car,
  Filter,
  Clock,
  MapPin,
  User,
  Building,
} from "lucide-react";
import type { Listing, ListingType } from "@zhivago/shared";
import { AVAILABLE_AMENITIES } from "./listings/AmenitiesSelector";
import { ListingCard } from "./ListingCard";
import { ErrorState } from "./ErrorState";
import {
  addRecentSearch,
  getRecentSearches,
  getRecentlyViewedIds,
  removeRecentSearch,
} from "@/lib/recent-activity";
import styles from "./ListingsExplorer.module.css";

type Category = "todos" | "aluguel" | "venda";
type SortOption = "relevance" | "newest" | "price_asc" | "price_desc";
type OwnerFilter = "todos" | "proprietario" | "imobiliaria";

const SORT_LABELS: Record<SortOption, string> = {
  relevance: "Mais relevantes",
  newest: "Mais recentes",
  price_asc: "Menor preço",
  price_desc: "Maior preço",
};

function parseAmenities(raw?: string | null): string[] {
  if (!raw) return [];
  try {
    if (raw.startsWith("[")) return JSON.parse(raw);
    return raw.split(",").map((s) => s.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function FilterChip({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon?: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className={`${styles.chip} ${active ? styles.chipActive : ""}`} onClick={onClick}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

export function ListingsExplorer({
  listings,
  isAdmin = false,
  loadError = false,
  initialQuery = "",
  initialType = null,
  initialCategory = "todos",
}: {
  listings: Listing[];
  isAdmin?: boolean;
  loadError?: boolean;
  // Preenchidos a partir da busca feita no hero da home (?q=&tipo=&categoria=), pra a busca
  // ali não ser só decorativa — reaproveita o mesmo motor de filtro desta página.
  initialQuery?: string;
  initialType?: ListingType | null;
  initialCategory?: Category;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [searchOpen, setSearchOpen] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [recentlyViewedIds, setRecentlyViewedIds] = useState<string[]>([]);
  const blurTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [activeType, setActiveType] = useState<ListingType | null>(initialType);
  const [activeCategory, setActiveCategory] = useState<Category>(initialCategory);
  const [minBedrooms, setMinBedrooms] = useState<number | null>(null);
  const [minBathrooms, setMinBathrooms] = useState<number | null>(null);
  const [minParking, setMinParking] = useState<number | null>(null);
  const [minPrice, setMinPrice] = useState<string>("");
  const [maxPrice, setMaxPrice] = useState<string>("");
  const [selectedAmenities, setSelectedAmenities] = useState<string[]>([]);
  const [ownerFilter, setOwnerFilter] = useState<OwnerFilter>("todos");
  const [sortOption, setSortOption] = useState<SortOption>("relevance");
  const [filtersModalOpen, setFiltersModalOpen] = useState(false);

  useEffect(() => {
    queueMicrotask(() => {
      setRecentSearches(getRecentSearches());
      setRecentlyViewedIds(getRecentlyViewedIds());
    });
  }, []);

  // Bloqueia o scroll do body enquanto o modal de filtros (bottom sheet no mobile) está aberto.
  useEffect(() => {
    if (!filtersModalOpen) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [filtersModalOpen]);

  const activeAdvancedCount =
    (minBedrooms !== null ? 1 : 0) +
    (minBathrooms !== null ? 1 : 0) +
    (minParking !== null ? 1 : 0) +
    (minPrice !== "" || maxPrice !== "" ? 1 : 0) +
    (selectedAmenities.length > 0 ? 1 : 0) +
    (ownerFilter !== "todos" ? 1 : 0);

  const hasActiveFilters =
    activeType !== null || activeCategory !== "todos" || activeAdvancedCount > 0 || query.trim() !== "";

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    const minP = minPrice ? Number(minPrice) : null;
    const maxP = maxPrice ? Number(maxPrice) : null;

    const data = listings.filter((item) => {
      const matchesType = !activeType || item.type === activeType;
      const matchesCategory = activeCategory === "todos" || item.category === activeCategory;
      const matchesQuery =
        !q || item.name.toLowerCase().includes(q) || item.location.toLowerCase().includes(q);

      const matchesBedrooms = minBedrooms === null || (item.bedrooms || 0) >= minBedrooms;
      const matchesBathrooms = minBathrooms === null || (item.bathrooms || 0) >= minBathrooms;
      const matchesParking = minParking === null || (item.parking || 0) >= minParking;

      const matchesMinPrice = minP === null || item.price >= minP;
      const matchesMaxPrice = maxP === null || item.price <= maxP;

      const itemAmenities = selectedAmenities.length > 0 ? parseAmenities(item.amenities) : [];
      const matchesAmenities = selectedAmenities.every((a) => itemAmenities.includes(a));

      const matchesOwner =
        ownerFilter === "todos" ||
        (ownerFilter === "proprietario" && !item.organizationId) ||
        (ownerFilter === "imobiliaria" && !!item.organizationId);

      return (
        matchesType &&
        matchesCategory &&
        matchesQuery &&
        matchesBedrooms &&
        matchesBathrooms &&
        matchesParking &&
        matchesMinPrice &&
        matchesMaxPrice &&
        matchesAmenities &&
        matchesOwner
      );
    });

    const sorted = [...data];
    if (sortOption === "price_asc") {
      sorted.sort((a, b) => a.price - b.price);
    } else if (sortOption === "price_desc") {
      sorted.sort((a, b) => b.price - a.price);
    } else if (sortOption === "newest") {
      sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } else {
      // "Mais relevantes": sem um motor de busca, usamos um sinal real disponível
      // (visualizações) com o mais recente como desempate — não é aleatório nem inventado.
      sorted.sort((a, b) => {
        if (b.viewCount !== a.viewCount) return b.viewCount - a.viewCount;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
    }

    return sorted;
  }, [
    listings,
    query,
    activeType,
    activeCategory,
    minBedrooms,
    minBathrooms,
    minParking,
    minPrice,
    maxPrice,
    selectedAmenities,
    ownerFilter,
    sortOption,
  ]);

  const recentlyViewedListings = useMemo(() => {
    if (recentlyViewedIds.length === 0) return [];
    const byId = new Map(listings.map((l) => [l.id, l]));
    return recentlyViewedIds.map((id) => byId.get(id)).filter((l): l is Listing => Boolean(l));
  }, [listings, recentlyViewedIds]);

  const locationSuggestions = useMemo(() => {
    const q = query.toLowerCase().trim();
    const seen = new Map<string, number>();
    for (const item of listings) {
      if (q && !item.location.toLowerCase().includes(q)) continue;
      seen.set(item.location, (seen.get(item.location) ?? 0) + 1);
    }
    return Array.from(seen.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([location]) => location);
  }, [listings, query]);

  const clearFilters = () => {
    setQuery("");
    setActiveType(null);
    setActiveCategory("todos");
    setMinBedrooms(null);
    setMinBathrooms(null);
    setMinParking(null);
    setMinPrice("");
    setMaxPrice("");
    setSelectedAmenities([]);
    setOwnerFilter("todos");
  };

  const toggleAmenity = (id: string) => {
    setSelectedAmenities((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const submitSearch = (value: string) => {
    setQuery(value);
    if (value.trim().length >= 2) {
      addRecentSearch(value.trim());
      setRecentSearches(getRecentSearches());
    }
    setSearchOpen(false);
  };

  const handleSearchBlur = () => {
    blurTimeout.current = setTimeout(() => setSearchOpen(false), 150);
  };

  const handleSuggestionMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    if (blurTimeout.current) clearTimeout(blurTimeout.current);
  };

  const showSuggestions =
    searchOpen && (recentSearches.length > 0 || locationSuggestions.length > 0);

  return (
    <div className={styles.explorerContainer}>
      {/* ── BUSCA ── */}
      <div className={styles.searchRow}>
        <div className={styles.searchBox}>
          <Search size={18} className={styles.searchIcon} />
          <input
            className={styles.searchInput}
            placeholder="Busque por cidade, bairro ou imóvel..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setSearchOpen(true)}
            onBlur={handleSearchBlur}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitSearch(query);
            }}
            aria-label="Buscar imóveis por cidade, bairro ou nome"
          />
          {query && (
            <button
              type="button"
              className={styles.clearQueryBtn}
              onMouseDown={handleSuggestionMouseDown}
              onClick={() => setQuery("")}
              aria-label="Limpar busca"
            >
              <X size={13} />
            </button>
          )}

          {showSuggestions && (
            <div className={styles.suggestionsPanel} role="listbox">
              {recentSearches.length > 0 && (
                <div className={styles.suggestionGroup}>
                  <span className={styles.suggestionGroupLabel}>Buscas recentes</span>
                  {recentSearches.map((term) => (
                    <div key={term} className={styles.suggestionRow}>
                      <button
                        type="button"
                        className={styles.suggestionItem}
                        onMouseDown={handleSuggestionMouseDown}
                        onClick={() => submitSearch(term)}
                      >
                        <Clock size={14} className={styles.suggestionIcon} />
                        <span>{term}</span>
                      </button>
                      <button
                        type="button"
                        className={styles.suggestionRemove}
                        aria-label={`Remover "${term}" das buscas recentes`}
                        onMouseDown={handleSuggestionMouseDown}
                        onClick={() => {
                          removeRecentSearch(term);
                          setRecentSearches(getRecentSearches());
                        }}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {locationSuggestions.length > 0 && (
                <div className={styles.suggestionGroup}>
                  <span className={styles.suggestionGroupLabel}>
                    {query ? "Localizações" : "Mais buscadas"}
                  </span>
                  {locationSuggestions.map((location) => (
                    <button
                      key={location}
                      type="button"
                      className={styles.suggestionItem}
                      onMouseDown={handleSuggestionMouseDown}
                      onClick={() => submitSearch(location)}
                    >
                      <MapPin size={14} className={styles.suggestionIcon} />
                      <span>{location}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── FILTROS PRIMÁRIOS ── */}
      <div className={styles.filtersBar}>
        <div className={styles.filterGroup}>
          <FilterChip
            label="Alugar"
            active={activeCategory === "aluguel"}
            onClick={() => setActiveCategory(activeCategory === "aluguel" ? "todos" : "aluguel")}
          />
          <FilterChip
            label="Comprar"
            active={activeCategory === "venda"}
            onClick={() => setActiveCategory(activeCategory === "venda" ? "todos" : "venda")}
          />
        </div>

        <span className={styles.filterSeparator} />

        <div className={styles.filterGroup}>
          <FilterChip
            label="Casa"
            icon={<Home size={14} />}
            active={activeType === "casa"}
            onClick={() => setActiveType(activeType === "casa" ? null : "casa")}
          />
          <FilterChip
            label="Apartamento"
            icon={<Building2 size={14} />}
            active={activeType === "apartamento"}
            onClick={() => setActiveType(activeType === "apartamento" ? null : "apartamento")}
          />
        </div>

        <button
          type="button"
          className={`${styles.advancedToggleBtn} ${activeAdvancedCount > 0 ? styles.advancedToggleActive : ""}`}
          onClick={() => setFiltersModalOpen(true)}
        >
          <SlidersHorizontal size={14} />
          <span>Mais filtros</span>
          {activeAdvancedCount > 0 && <span className={styles.activeBadge}>{activeAdvancedCount}</span>}
        </button>

        {hasActiveFilters && (
          <button type="button" className={styles.clearBtn} onClick={clearFilters}>
            <X size={13} />
            Limpar filtros
          </button>
        )}
      </div>

      {/* ── MODAL DE FILTROS AVANÇADOS (bottom sheet no mobile) ── */}
      {filtersModalOpen && (
        <div className={styles.modalOverlay} onClick={() => setFiltersModalOpen(false)}>
          <div
            className={styles.modalPanel}
            role="dialog"
            aria-modal="true"
            aria-label="Filtros avançados"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Filtros</h2>
              <button
                type="button"
                className={styles.modalCloseBtn}
                onClick={() => setFiltersModalOpen(false)}
                aria-label="Fechar filtros"
              >
                <X size={18} />
              </button>
            </div>

            <div className={styles.modalBody}>
              <section className={styles.filterSection}>
                <h3 className={styles.filterSectionTitle}>Preço (R$)</h3>
                <div className={styles.priceRow}>
                  <input
                    type="number"
                    inputMode="numeric"
                    placeholder="Mínimo"
                    value={minPrice}
                    onChange={(e) => setMinPrice(e.target.value)}
                    className={styles.priceInput}
                    aria-label="Preço mínimo"
                  />
                  <span className={styles.priceDash}>até</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    placeholder="Máximo"
                    value={maxPrice}
                    onChange={(e) => setMaxPrice(e.target.value)}
                    className={styles.priceInput}
                    aria-label="Preço máximo"
                  />
                </div>
              </section>

              <section className={styles.filterSection}>
                <h3 className={styles.filterSectionTitle}>Características</h3>
                <div className={styles.advancedGrid}>
                  <div className={styles.advancedGroup}>
                    <label className={styles.advancedLabel}>
                      <BedDouble size={13} /> Quartos
                    </label>
                    <div className={styles.numButtons}>
                      {[1, 2, 3, 4].map((num) => (
                        <button
                          key={num}
                          type="button"
                          className={`${styles.numBtn} ${minBedrooms === num ? styles.numBtnActive : ""}`}
                          onClick={() => setMinBedrooms(minBedrooms === num ? null : num)}
                        >
                          {num}+
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className={styles.advancedGroup}>
                    <label className={styles.advancedLabel}>
                      <Bath size={13} /> Banheiros
                    </label>
                    <div className={styles.numButtons}>
                      {[1, 2, 3].map((num) => (
                        <button
                          key={num}
                          type="button"
                          className={`${styles.numBtn} ${minBathrooms === num ? styles.numBtnActive : ""}`}
                          onClick={() => setMinBathrooms(minBathrooms === num ? null : num)}
                        >
                          {num}+
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className={styles.advancedGroup}>
                    <label className={styles.advancedLabel}>
                      <Car size={13} /> Vagas
                    </label>
                    <div className={styles.numButtons}>
                      {[1, 2, 3].map((num) => (
                        <button
                          key={num}
                          type="button"
                          className={`${styles.numBtn} ${minParking === num ? styles.numBtnActive : ""}`}
                          onClick={() => setMinParking(minParking === num ? null : num)}
                        >
                          {num}+
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </section>

              <section className={styles.filterSection}>
                <h3 className={styles.filterSectionTitle}>Comodidades</h3>
                <div className={styles.amenitiesGrid}>
                  {AVAILABLE_AMENITIES.map(({ id, label, icon: Icon }) => {
                    const active = selectedAmenities.includes(id);
                    return (
                      <button
                        key={id}
                        type="button"
                        className={`${styles.amenityBtn} ${active ? styles.amenityBtnActive : ""}`}
                        onClick={() => toggleAmenity(id)}
                        aria-pressed={active}
                      >
                        <Icon size={15} />
                        <span>{label}</span>
                      </button>
                    );
                  })}
                </div>
              </section>

              <section className={styles.filterSection}>
                <h3 className={styles.filterSectionTitle}>Anunciante</h3>
                <div className={styles.numButtons}>
                  <button
                    type="button"
                    className={`${styles.numBtn} ${ownerFilter === "proprietario" ? styles.numBtnActive : ""}`}
                    onClick={() => setOwnerFilter(ownerFilter === "proprietario" ? "todos" : "proprietario")}
                  >
                    <User size={13} style={{ marginRight: 6 }} />
                    Direto com proprietário
                  </button>
                  <button
                    type="button"
                    className={`${styles.numBtn} ${ownerFilter === "imobiliaria" ? styles.numBtnActive : ""}`}
                    onClick={() => setOwnerFilter(ownerFilter === "imobiliaria" ? "todos" : "imobiliaria")}
                  >
                    <Building size={13} style={{ marginRight: 6 }} />
                    Imobiliária
                  </button>
                </div>
              </section>
            </div>

            <div className={styles.modalFooter}>
              <button type="button" className={styles.modalClearBtn} onClick={clearFilters}>
                Limpar tudo
              </button>
              <button
                type="button"
                className={styles.modalApplyBtn}
                onClick={() => setFiltersModalOpen(false)}
              >
                Ver {filtered.length} {filtered.length === 1 ? "imóvel" : "imóveis"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── VISTOS RECENTEMENTE ── */}
      {!hasActiveFilters && recentlyViewedListings.length > 0 && (
        <section className={styles.recentSection}>
          <h2 className={styles.recentTitle}>Vistos recentemente</h2>
          <div className={styles.recentRail}>
            {recentlyViewedListings.map((listing) => (
              <Link key={listing.id} href={`/imovel/${listing.id}`} className={styles.recentCard}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={listing.images[0]?.url || "/placeholder.jpg"}
                  alt={listing.name}
                  className={styles.recentImage}
                  loading="lazy"
                />
                <div className={styles.recentInfo}>
                  <span className={styles.recentName}>{listing.name}</span>
                  <span className={styles.recentLocation}>{listing.location}</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ── RESULTADOS ── */}
      {!loadError && (
        <div className={styles.resultsHeader}>
          <span className={styles.resultsCount}>
            {filtered.length} {filtered.length === 1 ? "imóvel encontrado" : "imóveis encontrados"}
          </span>

          <label className={styles.sortLabel}>
            <span className={styles.sortLabelText}>Ordenar por</span>
            <select
              className={styles.sortSelect}
              value={sortOption}
              onChange={(e) => setSortOption(e.target.value as SortOption)}
            >
              {(Object.keys(SORT_LABELS) as SortOption[]).map((option) => (
                <option key={option} value={option}>
                  {SORT_LABELS[option]}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {loadError ? (
        <ErrorState message="Tente novamente em alguns instantes. Seus filtros continuam aplicados." />
      ) : filtered.length === 0 ? (
        <div className={styles.emptyStateContainer}>
          <Filter size={32} className={styles.emptyIcon} />
          <p className={styles.emptyTitle}>Nenhum imóvel encontrado</p>
          <p className={styles.emptySubtitle}>Não encontramos imóveis com esses critérios.</p>
          {hasActiveFilters && (
            <button type="button" className={styles.emptyResetBtn} onClick={clearFilters}>
              Limpar filtros
            </button>
          )}
        </div>
      ) : (
        <div className={styles.grid}>
          {filtered.map((listing) => (
            <ListingCard key={listing.id} listing={listing} isAdmin={isAdmin} />
          ))}
        </div>
      )}
    </div>
  );
}
