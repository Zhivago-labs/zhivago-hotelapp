"use client";

import { useState } from "react";
import Link from "next/link";
import type { Listing } from "@zhivago/shared";
import { formatPrice } from "@/lib/api";
import { FavoriteButton } from "@/components/favorites/FavoriteButton";
import shared from "./shared.module.css";
import styles from "./LandingHero.module.css";

const STATUS_LABEL: Record<Listing["status"], string> = {
  PENDING: "Em análise",
  APPROVED: "Disponível",
  REJECTED: "Indisponível",
  REMOVED: "Indisponível",
  SOLD: "Vendido",
};

export function LandingHero({
  featuredListing,
  locations,
}: {
  featuredListing: Listing | null;
  locations: string[];
}) {
  const [activeTab, setActiveTab] = useState<"client" | "agency">("client");
  const [selectedLocation, setSelectedLocation] = useState("");

  const popularLocations = locations.length > 0 
    ? locations.slice(0, 5) 
    : ["São Paulo", "Rio de Janeiro", "Curitiba", "Florianópolis", "Belo Horizonte"];

  const handleSelectLocation = (loc: string) => {
    setSelectedLocation(loc);
    const input = document.getElementById("hero-q") as HTMLInputElement | null;
    if (input) {
      input.value = loc;
      input.focus();
    }
  };

  return (
    <header className={styles.hero}>
      <div className={`${shared.wrap} ${styles.heroContainer}`}>
        
        {/* Controle Segmentado de Perfil */}
        <div className={styles.segmentedControlWrap}>
          <div className={styles.segmentedControl} role="tablist" aria-label="Perfil de navegação">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "client"}
              className={`${styles.segmentBtn} ${activeTab === "client" ? styles.segmentBtnActive : ""}`}
              onClick={() => setActiveTab("client")}
            >
              Para quem busca imóvel
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "agency"}
              className={`${styles.segmentBtn} ${activeTab === "agency" ? styles.segmentBtnActive : ""}`}
              onClick={() => setActiveTab("agency")}
            >
              Para imobiliárias e corretores
              <span className={styles.crmTag}>CRM</span>
            </button>
          </div>
        </div>

        <div className={styles.heroGrid}>
          {/* Conteúdo da Esquerda */}
          <div className={styles.heroCopy}>
            {activeTab === "client" ? (
              <>
                <h1 className={styles.heroTitle}>
                  Encontre o imóvel certo, negocie direto com quem anuncia.
                </h1>
                <p className={styles.heroSub}>
                  Opções selecionadas para temporada, aluguel mensal ou compra definitiva.
                  Sem intermediários ocultos e com chat em tempo real.
                </p>

                {/* Formulário de Busca Integrado */}
                <form action="/imoveis" method="GET" className={styles.searchBar}>
                  <div className={styles.searchField}>
                    <label htmlFor="hero-q">Localização</label>
                    <input
                      id="hero-q"
                      name="q"
                      type="text"
                      placeholder="Cidade ou região"
                      value={selectedLocation}
                      onChange={(e) => setSelectedLocation(e.target.value)}
                      list="hero-locations"
                      autoComplete="off"
                    />
                    <datalist id="hero-locations">
                      {locations.map((loc) => (
                        <option key={loc} value={loc} />
                      ))}
                    </datalist>
                  </div>

                  <div className={styles.fieldDivider} />

                  <div className={styles.searchField}>
                    <label htmlFor="hero-tipo">Tipo</label>
                    <select id="hero-tipo" name="tipo" defaultValue="">
                      <option value="">Todos</option>
                      <option value="apartamento">Apartamento</option>
                      <option value="casa">Casa</option>
                    </select>
                  </div>

                  <div className={styles.fieldDivider} />

                  <div className={styles.searchField}>
                    <label htmlFor="hero-categoria">Finalidade</label>
                    <select id="hero-categoria" name="categoria" defaultValue="">
                      <option value="">Todas</option>
                      <option value="aluguel">Alugar</option>
                      <option value="venda">Comprar</option>
                    </select>
                  </div>

                  <button type="submit" className={styles.searchBtn}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="11" cy="11" r="7" />
                      <path d="M21 21l-4.3-4.3" />
                    </svg>
                    <span>Buscar</span>
                  </button>
                </form>

                {/* Destinos Sugeridos */}
                <div className={styles.destinationsRow}>
                  <span className={styles.destinationsLabel}>Destinos frequentes:</span>
                  <div className={styles.destinationTags}>
                    {popularLocations.map((loc) => (
                      <button
                        key={loc}
                        type="button"
                        className={`${styles.destinationBtn} ${selectedLocation === loc ? styles.destinationBtnActive : ""}`}
                        onClick={() => handleSelectLocation(loc)}
                      >
                        {loc}
                      </button>
                    ))}
                  </div>
                </div>

                <div className={styles.heroLinks}>
                  <Link href="/imoveis" className={styles.linkPrimary}>
                    Ver todos os imóveis disponíveis &rarr;
                  </Link>
                  <Link href="/anuncios/novo" className={styles.linkSecondary}>
                    Quer anunciar seu próprio imóvel?
                  </Link>
                </div>
              </>
            ) : (
              <>
                <h1 className={styles.heroTitle}>
                  A infraestrutura completa para a sua imobiliária vender mais.
                </h1>
                <p className={styles.heroSub}>
                  Publique imóveis no marketplace Zhivago e receba interessados organizados automaticamente
                  em um funil Kanban, com distribuição entre corretores e histórico de atendimento.
                </p>

                <div className={styles.benefitsList}>
                  <div className={styles.benefitItem}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    <div>
                      <strong>Funil de leads integrado:</strong> cada conversa em um anúncio gera um lead sem trabalho manual.
                    </div>
                  </div>
                  <div className={styles.benefitItem}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    <div>
                      <strong>Distribuição Round-Robin:</strong> atribuição automática e equilibrada para sua equipe de corretores.
                    </div>
                  </div>
                  <div className={styles.benefitItem}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    <div>
                      <strong>Métricas de SLA e conversão:</strong> saiba exatamente quanto tempo cada corretor leva para responder.
                    </div>
                  </div>
                </div>

                <div className={styles.agencyActions}>
                  <Link href="/cadastro" className={styles.ctaPrimary}>
                    Cadastrar imobiliária
                  </Link>
                  <Link href="#crm" className={styles.ctaSecondary}>
                    Ver demonstração do CRM
                  </Link>
                </div>
              </>
            )}
          </div>

          {/* Coluna da Direita: Preview Estável e Limpo */}
          <div className={styles.heroVisual}>
            {activeTab === "client" ? (
              featuredListing ? (
                <div className={styles.featuredCard}>
                  <div className={styles.cardHeader}>
                    <span className={styles.cardKicker}>Imóvel em destaque</span>
                    <span className={styles.cardAuditTag}>Anúncio verificado</span>
                  </div>

                  <Link href={`/imovel/${featuredListing.id}`} className={styles.cardMediaLink}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={featuredListing.images[0].url} alt={featuredListing.name} className={styles.cardImage} />
                    <div className={styles.cardFav}>
                      <FavoriteButton listingId={featuredListing.id} size={15} />
                    </div>
                  </Link>

                  <div className={styles.cardDetails}>
                    <div className={styles.cardLocation}>{featuredListing.location}</div>
                    <Link href={`/imovel/${featuredListing.id}`} className={styles.cardTitle}>
                      {featuredListing.name}
                    </Link>

                    <div className={styles.cardSpecs}>
                      <span>{featuredListing.bedrooms} quartos</span>
                      <span className={styles.bullet}>&bull;</span>
                      <span>{featuredListing.parking} vaga{featuredListing.parking === 1 ? "" : "s"}</span>
                      <span className={styles.bullet}>&bull;</span>
                      <span className={styles.statusOk}>{STATUS_LABEL[featuredListing.status]}</span>
                    </div>

                    <div className={styles.cardFooter}>
                      <div className={styles.cardPrice}>{formatPrice(featuredListing)}</div>
                      <Link href={`/imovel/${featuredListing.id}`} className={styles.cardAction}>
                        Ver detalhes &rarr;
                      </Link>
                    </div>
                  </div>
                </div>
              ) : (
                <div className={styles.emptyFeatured}>
                  <p>Catálogo sendo atualizado com novos imóveis auditados.</p>
                </div>
              )
            ) : (
              /* Preview do CRM no modo Imobiliária */
              <div className={styles.crmPreview}>
                <div className={styles.crmTopBar}>
                  <div className={styles.crmDots}>
                    <span />
                    <span />
                    <span />
                  </div>
                  <span className={styles.crmOrgName}>Zhivago CRM &bull; Gestão Ativa</span>
                </div>

                <div className={styles.crmStatsBar}>
                  <div className={styles.crmStat}>
                    <span className={styles.statLabel}>Novos leads</span>
                    <span className={styles.statNum}>28</span>
                  </div>
                  <div className={styles.crmStat}>
                    <span className={styles.statLabel}>Tempo de resposta</span>
                    <span className={styles.statNum}>4 min</span>
                  </div>
                  <div className={styles.crmStat}>
                    <span className={styles.statLabel}>Conversão</span>
                    <span className={styles.statNum}>31%</span>
                  </div>
                </div>

                <div className={styles.crmPipeline}>
                  <div className={styles.pipelineHeader}>
                    <span>Etapas do Funil</span>
                    <span className={styles.pipelineTotal}>14 oportunidades ativas</span>
                  </div>
                  <div className={styles.pipelineTrack}>
                    <div className={styles.pipelineStage}>
                      <div className={styles.stageBar} style={{ width: "100%", background: "#0ea5e9" }} />
                      <span className={styles.stageLabel}>Novos (5)</span>
                    </div>
                    <div className={styles.pipelineStage}>
                      <div className={styles.stageBar} style={{ width: "70%", background: "#6366f1" }} />
                      <span className={styles.stageLabel}>Visitas (4)</span>
                    </div>
                    <div className={styles.pipelineStage}>
                      <div className={styles.stageBar} style={{ width: "45%", background: "#10b981" }} />
                      <span className={styles.stageLabel}>Propostas (3)</span>
                    </div>
                  </div>
                </div>

                <div className={styles.crmLeadItem}>
                  <div className={styles.leadAvatar}>MC</div>
                  <div className={styles.leadInfo}>
                    <span className={styles.leadName}>Marina Costa</span>
                    <span className={styles.leadProperty}>Apto Jardins &bull; Atribuído a Juliana S.</span>
                  </div>
                  <span className={styles.leadSla}>No prazo</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Faixa de Indicadores de Confiança (Sóbria e Contínua) */}
        <div className={styles.trustBand}>
          <div className={styles.trustItem}>
            <span className={styles.trustNumber}>100%</span>
            <span className={styles.trustText}>Anúncios com fotos e dados auditados antes da publicação</span>
          </div>
          <div className={styles.trustSeparator} />
          <div className={styles.trustItem}>
            <span className={styles.trustNumber}>Direto</span>
            <span className={styles.trustText}>Chat integrado com proprietários e corretores credenciados</span>
          </div>
          <div className={styles.trustSeparator} />
          <div className={styles.trustItem}>
            <span className={styles.trustNumber}>3 Modos</span>
            <span className={styles.trustText}>Temporada, locação mensal ou aquisição com fluxos claros</span>
          </div>
          <div className={styles.trustSeparator} />
          <div className={styles.trustItem}>
            <span className={styles.trustNumber}>CRM Próprio</span>
            <span className={styles.trustText}>Distribuição automática de leads e métricas de atendimento</span>
          </div>
        </div>

      </div>
    </header>
  );
}
