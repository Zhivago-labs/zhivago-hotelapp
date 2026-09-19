"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import {
  Building2,
  Calendar,
  DollarSign,
  Star,
  TrendingUp,
  ShieldCheck,
  Clock,
  Users,
  Kanban,
  Plus,
  Upload,
  BarChart3,
  Percent,
  Calculator,
  Search,
  Sparkles,
  CheckCircle2,
} from "lucide-react";
import type { SessionUser } from "@/lib/session";
import type { MyStats, OwnedListing, ReceivedBooking } from "@/lib/listings-api";
import { LineChart } from "./LineChart";
import { OwnerListingsSection } from "./OwnerListingsSection";
import { ReceivedBookingItem } from "./ReceivedBookingItem";
import { ExportBookingsButton } from "./ExportBookingsButton";
import { AgencyBadge } from "../AgencyBadge";
import styles from "@/app/dashboard/page.module.css";

function monthLabel(monthKey: string): string {
  const [year, month] = monthKey.split("-");
  return `${month}/${year.slice(2)}`;
}

function currency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

interface Props {
  user: SessionUser;
  isAgency: boolean;
  showTeamLink: boolean;
  showPipelineLink: boolean;
  canApproveOrgListings: boolean;
  stats: MyStats;
  listings: OwnedListing[];
  receivedBookings: {
    bookings: ReceivedBooking[];
    total: number;
    page: number;
    totalPages: number;
  };
  search: string;
  page: number;
}

export function DashboardClientView({
  user,
  isAgency,
  showTeamLink,
  showPipelineLink,
  canApproveOrgListings,
  stats,
  listings,
  receivedBookings,
  search,
  page,
}: Props) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const initialTab = (searchParams.get("tab") as "overview" | "listings" | "bookings") || "overview";
  const [activeTab, setActiveTab] = useState<"overview" | "listings" | "bookings">(initialTab);
  const [searchValue, setSearchValue] = useState(search);

  const handleTabChange = (tab: "overview" | "listings" | "bookings") => {
    setActiveTab(tab);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const handleSearchSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "bookings");
    if (searchValue) params.set("q", searchValue);
    else params.delete("q");
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const months = Object.keys(stats.bookingsByMonth).sort();
  const bookingsData = months.length
    ? months.map((m) => ({ label: monthLabel(m), value: stats.bookingsByMonth[m] }))
    : [{ label: "Sem dados", value: 0 }];
  const revenueData = months.length
    ? months.map((m) => ({ label: monthLabel(m), value: stats.revenueByMonth[m] ?? 0 }))
    : [{ label: "Sem dados", value: 0 }];

  // Métricas financeiras e operacionais
  const totalRevenue = stats.rentalRevenue + stats.salesRevenue;
  const rentalPct = totalRevenue > 0 ? (stats.rentalRevenue / totalRevenue) * 100 : 0;
  const salesPct = totalRevenue > 0 ? (stats.salesRevenue / totalRevenue) * 100 : 0;
  const totalListings = stats.statusCounts.approved + stats.statusCounts.pending + stats.statusCounts.rejected;

  const totalBookingsCount = (Object.values(stats.bookingsByMonth) as number[]).reduce((a: number, b: number) => a + b, 0);
  const avgTicket = totalBookingsCount > 0 ? Math.round(stats.rentalRevenue / totalBookingsCount) : 0;
  const occupancyRate = stats.statusCounts.approved > 0
    ? Math.min(100, Math.round((receivedBookings.total / stats.statusCounts.approved) * 100))
    : 0;

  return (
    <div className={styles.dashboardContainer}>
      {/* ── HEADER HERO COM QUICK ACTIONS ── */}
      <div className={styles.header}>
        <div className={styles.headerInfo}>
          {isAgency ? (
            <div>
              <div className={styles.titleRow}>
                <h1 className={styles.title}>Painel Corporativo</h1>
                <AgencyBadge verified={user.accountType === "AGENCY" && user.verified} />
              </div>
              <p className={styles.subtitle}>
                Gestão de imóveis, vendas e performance financeira de <strong>{user.companyName || user.name}</strong>.
              </p>
            </div>
          ) : (
            <div>
              <div className={styles.titleRow}>
                <h1 className={styles.title}>Meu Dashboard</h1>
                <span className={styles.welcomeBadge}>
                  <Sparkles size={13} />
                  Anfitrião Ativo
                </span>
              </div>
              <p className={styles.subtitle}>
                Olá, <strong>{user.name.split(" ")[0]}</strong>. Acompanhe o desempenho, ocupação e faturamento dos seus imóveis.
              </p>
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className={styles.quickActionsBar}>
          <Link href="/anuncios/novo" className={styles.primaryActionButton}>
            <Plus size={16} />
            Novo Anúncio
          </Link>

          {isAgency && (
            <Link href="/anuncios/importar" className={styles.quickActionButton}>
              <Upload size={15} />
              Importar
            </Link>
          )}

          {showTeamLink && (
            <Link href="/equipe" className={styles.quickActionButton}>
              <Users size={15} />
              Equipe
            </Link>
          )}

          {showPipelineLink && (
            <Link href="/imobiliaria" className={styles.quickActionButton}>
              <Kanban size={15} />
              Pipeline de Leads
            </Link>
          )}
        </div>
      </div>

      {/* ── BARRA DE ABAS PRINCIPAIS ── */}
      <div className={styles.mainNavTabs}>
        <button
          type="button"
          className={`${styles.navTabButton} ${activeTab === "overview" ? styles.navTabButtonActive : ""}`}
          onClick={() => handleTabChange("overview")}
        >
          <BarChart3 size={18} />
          <span>Visão Geral</span>
        </button>

        <button
          type="button"
          className={`${styles.navTabButton} ${activeTab === "listings" ? styles.navTabButtonActive : ""}`}
          onClick={() => handleTabChange("listings")}
        >
          <Building2 size={18} />
          <span>Meus Imóveis</span>
          <span className={styles.navTabBadge}>{listings.length}</span>
        </button>

        <button
          type="button"
          className={`${styles.navTabButton} ${activeTab === "bookings" ? styles.navTabButtonActive : ""}`}
          onClick={() => handleTabChange("bookings")}
        >
          <Calendar size={18} />
          <span>Reservas & Hóspedes</span>
          <span className={styles.navTabBadge}>{receivedBookings.total}</span>
        </button>
      </div>

      {/* ── ABA 1: VISÃO GERAL (DESEMPENHO & KPIS) ── */}
      {activeTab === "overview" && (
        <div className={styles.tabContentFade}>
          {/* Grid de KPIs Financeiros (6 Cards Premium) */}
          <div className={styles.statsGrid}>
            <div className={styles.statTile}>
              <div className={styles.statIconWrap} style={{ background: "rgba(34, 197, 94, 0.12)", color: "#22c55e" }}>
                <TrendingUp size={20} />
              </div>
              <p className={styles.statValue}>{currency(totalRevenue)}</p>
              <p className={styles.statLabel}>Faturamento Total</p>
            </div>

            <div className={styles.statTile}>
              <div className={styles.statIconWrap} style={{ background: "rgba(59, 130, 246, 0.12)", color: "#3b82f6" }}>
                <DollarSign size={20} />
              </div>
              <p className={styles.statValue}>{currency(stats.rentalRevenue)}</p>
              <p className={styles.statLabel}>Receita de Aluguel</p>
            </div>

            <div className={styles.statTile}>
              <div className={styles.statIconWrap} style={{ background: "rgba(99, 102, 241, 0.12)", color: "#6366f1" }}>
                <Calculator size={20} />
              </div>
              <p className={styles.statValue}>{currency(avgTicket)}</p>
              <p className={styles.statLabel}>Ticket Médio por Reserva</p>
            </div>

            <div className={styles.statTile}>
              <div className={styles.statIconWrap} style={{ background: "rgba(236, 72, 153, 0.12)", color: "#ec4899" }}>
                <Percent size={20} />
              </div>
              <p className={styles.statValue}>{occupancyRate}%</p>
              <p className={styles.statLabel}>Taxa de Ocupação Est.</p>
            </div>

            <div className={styles.statTile}>
              <div className={styles.statIconWrap} style={{ background: "rgba(255, 56, 92, 0.12)", color: "#ff385c" }}>
                <ShieldCheck size={20} />
              </div>
              <p className={styles.statValue}>{stats.statusCounts.approved}</p>
              <p className={styles.statLabel}>Imóveis Ativos</p>
            </div>

            <div className={styles.statTile}>
              <div className={styles.statIconWrap} style={{ background: "rgba(245, 158, 11, 0.12)", color: "#f59e0b" }}>
                <Clock size={20} />
              </div>
              <p className={styles.statValue}>{stats.statusCounts.pending}</p>
              <p className={styles.statLabel}>Em Moderação</p>
            </div>
          </div>

          {/* Gráficos de Linha */}
          <div className={styles.chartsGrid}>
            <LineChart title="Histórico de Reservas (Mensal)" data={bookingsData} color="#ff385c" format="number" />
            <LineChart title="Histórico de Faturamento (R$)" data={revenueData} color="#22c55e" format="currency" />
          </div>

          {/* Gráficos de Composição */}
          <div className={styles.visualChartsGrid}>
            {/* Origem do Faturamento */}
            <div className={styles.visualChartCard}>
              <h3 className={styles.visualChartTitle}>Origem do Faturamento</h3>
              {totalRevenue === 0 ? (
                <div className={styles.emptyChartState}>Nenhuma receita registrada no período.</div>
              ) : (
                <div className={styles.compositionChartWrap}>
                  <div className={styles.compositionProgressBar}>
                    <div 
                      className={styles.compositionProgressSegment} 
                      style={{ width: `${rentalPct}%`, backgroundColor: "#22c55e" }}
                      title={`Aluguel: ${rentalPct.toFixed(1)}%`}
                    />
                    <div 
                      className={styles.compositionProgressSegment} 
                      style={{ width: `${salesPct}%`, backgroundColor: "#6366f1" }}
                      title={`Venda: ${salesPct.toFixed(1)}%`}
                    />
                  </div>
                  <div className={styles.compositionLegend}>
                    <div className={styles.legendItem}>
                      <span className={styles.legendDot} style={{ backgroundColor: "#22c55e" }} />
                      <div className={styles.legendLabelGroup}>
                        <span className={styles.legendLabel}>Aluguel</span>
                        <span className={styles.legendValue}>{currency(stats.rentalRevenue)} ({rentalPct.toFixed(0)}%)</span>
                      </div>
                    </div>
                    <div className={styles.legendItem}>
                      <span className={styles.legendDot} style={{ backgroundColor: "#6366f1" }} />
                      <div className={styles.legendLabelGroup}>
                        <span className={styles.legendLabel}>Venda</span>
                        <span className={styles.legendValue}>{currency(stats.salesRevenue)} ({salesPct.toFixed(0)}%)</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Status do Portfólio */}
            <div className={styles.visualChartCard}>
              <h3 className={styles.visualChartTitle}>Status do Portfólio</h3>
              {totalListings === 0 ? (
                <div className={styles.emptyChartState}>Nenhum imóvel cadastrado no portfólio.</div>
              ) : (
                <div className={styles.compositionChartWrap}>
                  <div className={styles.compositionProgressBar}>
                    <div 
                      className={styles.compositionProgressSegment} 
                      style={{ width: `${totalListings > 0 ? (stats.statusCounts.approved / totalListings) * 100 : 0}%`, backgroundColor: "#22c55e" }}
                    />
                    <div 
                      className={styles.compositionProgressSegment} 
                      style={{ width: `${totalListings > 0 ? (stats.statusCounts.pending / totalListings) * 100 : 0}%`, backgroundColor: "#f59e0b" }}
                    />
                    <div 
                      className={styles.compositionProgressSegment} 
                      style={{ width: `${totalListings > 0 ? (stats.statusCounts.rejected / totalListings) * 100 : 0}%`, backgroundColor: "#ef4444" }}
                    />
                  </div>
                  <div className={styles.compositionLegend}>
                    <div className={styles.legendItem}>
                      <span className={styles.legendDot} style={{ backgroundColor: "#22c55e" }} />
                      <div className={styles.legendLabelGroup}>
                        <span className={styles.legendLabel}>Ativos</span>
                        <span className={styles.legendValue}>{stats.statusCounts.approved} imóveis</span>
                      </div>
                    </div>
                    <div className={styles.legendItem}>
                      <span className={styles.legendDot} style={{ backgroundColor: "#f59e0b" }} />
                      <div className={styles.legendLabelGroup}>
                        <span className={styles.legendLabel}>Pendentes</span>
                        <span className={styles.legendValue}>{stats.statusCounts.pending} imóveis</span>
                      </div>
                    </div>
                    <div className={styles.legendItem}>
                      <span className={styles.legendDot} style={{ backgroundColor: "#ef4444" }} />
                      <div className={styles.legendLabelGroup}>
                        <span className={styles.legendLabel}>Rejeitados</span>
                        <span className={styles.legendValue}>{stats.statusCounts.rejected} imóveis</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Avaliação Média */}
            <div className={styles.visualChartCard}>
              <h3 className={styles.visualChartTitle}>Avaliação Média dos Imóveis</h3>
              {!stats.propertyRatings || stats.propertyRatings.length === 0 ? (
                <div className={styles.emptyChartState}>Nenhuma avaliação recebida ainda.</div>
              ) : (
                <div className={styles.ratingsChartWrap}>
                  {stats.propertyRatings.slice(0, 4).map((rating: { name: string; average: number }, idx: number) => {
                    const percentage = (rating.average / 5) * 100;
                    return (
                      <div key={rating.name + idx} className={styles.ratingBarItem}>
                        <div className={styles.ratingBarInfo}>
                          <span className={styles.ratingBarName} title={rating.name}>{rating.name}</span>
                          <span className={styles.ratingBarValue}>
                            {rating.average.toFixed(1)} <Star size={12} fill="#f59e0b" color="#f59e0b" style={{ display: "inline-block", verticalAlign: "middle" }} />
                          </span>
                        </div>
                        <div className={styles.ratingBarTrack}>
                          <div className={styles.ratingBarFill} style={{ width: `${percentage}%`, backgroundColor: "#f59e0b" }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── ABA 2: MEUS IMÓVEIS ── */}
      {activeTab === "listings" && (
        <div className={styles.tabContentFade}>
          <OwnerListingsSection
            initialListings={listings}
            isAgency={isAgency}
            canApproveOrgListings={canApproveOrgListings}
          />
        </div>
      )}

      {/* ── ABA 3: RESERVAS & HÓSPEDES ── */}
      {activeTab === "bookings" && (
        <div className={styles.tabContentFade}>
          <section className={styles.section}>
            <div className={styles.sectionHeader} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }}>
              <div>
                <h2 className={styles.sectionTitle}>
                  <Calendar size={20} className={styles.sectionTitleIcon} />
                  Reservas Recebidas ({receivedBookings.total})
                </h2>
                <p className={styles.sectionSubtitle}>
                  Acompanhe as solicitações dos hóspedes, valide estadias e comunique-se diretamente.
                </p>
              </div>
              <ExportBookingsButton bookings={receivedBookings.bookings} />
            </div>

            <form onSubmit={handleSearchSubmit} className={styles.searchForm}>
              <div className={styles.searchWrapper}>
                <Search size={16} className={styles.searchIcon} />
                <input
                  type="search"
                  value={searchValue}
                  onChange={(e) => setSearchValue(e.target.value)}
                  placeholder="Buscar por nome do hóspede ou título do imóvel..."
                  className={styles.searchInput}
                />
              </div>
              <button type="submit" className={styles.searchButton}>
                Buscar
              </button>
            </form>

            {receivedBookings.bookings.length === 0 ? (
              <div className={styles.emptyStateContainer}>
                <p className={styles.empty}>Nenhuma reserva encontrada para a busca.</p>
              </div>
            ) : (
              <>
                <div className={styles.bookingsList}>
                  {receivedBookings.bookings.map((booking) => (
                    <ReceivedBookingItem key={booking.id} booking={booking} />
                  ))}
                </div>

                {receivedBookings.totalPages > 1 && (
                  <div className={styles.pagination}>
                    {page <= 1 ? (
                      <span className={`${styles.pageLink} ${styles.pageLinkDisabled}`}>← Anterior</span>
                    ) : (
                      <Link href={`/dashboard?tab=bookings&q=${encodeURIComponent(search)}&page=${page - 1}`} className={styles.pageLink}>
                        ← Anterior
                      </Link>
                    )}
                    <span className={styles.pageInfo}>
                      Página {receivedBookings.page} de {receivedBookings.totalPages}
                    </span>
                    {page >= receivedBookings.totalPages ? (
                      <span className={`${styles.pageLink} ${styles.pageLinkDisabled}`}>Próxima →</span>
                    ) : (
                      <Link href={`/dashboard?tab=bookings&q=${encodeURIComponent(search)}&page=${page + 1}`} className={styles.pageLink}>
                        Próxima →
                      </Link>
                    )}
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
