import Link from "next/link";
import type { Metadata } from "next";
import {
  Clock,
  CheckCircle2,
  AlertCircle,
  Layers,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { requireAuth } from "@/lib/session";
import { getAdminStats, getAdminListings, getAdminAgencies, getAdminOrganizations } from "@/lib/admin-api";
import { LineChart } from "@/components/dashboard/LineChart";
import { AdminListingCard } from "@/components/admin/AdminListingCard";
import { AgencyAccountCard } from "@/components/admin/AgencyAccountCard";
import { OrganizationAccountCard } from "@/components/admin/OrganizationAccountCard";
import { BookingsView } from "@/components/admin/BookingsView";
import { OffersView } from "@/components/admin/OffersView";
import { ReviewsView } from "@/components/admin/ReviewsView";
import { LogsView } from "@/components/admin/LogsView";
import { RevenueView } from "@/components/admin/RevenueView";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Painel Admin" };

const STATUS_TABS = [
  { value: "PENDING", label: "Pendentes", icon: Clock },
  { value: "APPROVED", label: "Aprovados", icon: CheckCircle2 },
  { value: "REJECTED", label: "Rejeitados", icon: AlertCircle },
  { value: "ALL", label: "Todos os Imóveis", icon: Layers },
] as const;

const VERIFIED_TABS: Array<{ value: "true" | "false" | "ALL"; label: string }> = [
  { value: "false", label: "Pendentes" },
  { value: "true", label: "Verificadas" },
  { value: "ALL", label: "Todas" },
];

function monthLabel(monthKey: string): string {
  const [year, month] = monthKey.split("-");
  return `${month}/${year.slice(2)}`;
}

type Props = {
  searchParams: Promise<{
    view?: string;
    type?: string;
    status?: string;
    verified?: string;
    q?: string;
    page?: string;
  }>;
};

const VIEWS = ["moderation", "stats", "agencies", "bookings", "offers", "reviews", "logs", "revenue"] as const;
type View = (typeof VIEWS)[number];

export default async function AdminPage({ searchParams }: Props) {
  const { token, user } = await requireAuth("/admin");
  const {
    view: viewParam,
    type: typeParam,
    status: statusParam,
    verified: verifiedParam,
    q: searchParam,
    page: pageParam,
  } = await searchParams;

  if (user.role !== "ADMIN") {
    return (
      <main className={styles.main}>
        <p className={styles.restricted}>Acesso restrito ao administrador.</p>
      </main>
    );
  }

  const view: View = VIEWS.includes(viewParam as View) ? (viewParam as View) : "moderation";
  const accountsType = typeParam === "organizations" ? "organizations" : "users";
  const status = statusParam ?? "PENDING";
  const verified = verifiedParam === "true" || verifiedParam === "ALL" ? verifiedParam : "false";
  const search = searchParam ?? "";
  const page = Math.max(1, Number(pageParam) || 1);

  return (
    <main className={styles.main}>
      <div className={styles.header}>
        <h1 className={styles.title}>Painel Admin</h1>
      </div>

      <div className={styles.viewTabs}>
        <Link
          href="/admin?view=moderation"
          className={`${styles.viewTab} ${view === "moderation" ? styles.viewTabActive : ""}`}
        >
          Moderação
        </Link>
        <Link href="/admin?view=stats" className={`${styles.viewTab} ${view === "stats" ? styles.viewTabActive : ""}`}>
          Estatísticas
        </Link>
        <Link
          href="/admin?view=agencies"
          className={`${styles.viewTab} ${view === "agencies" ? styles.viewTabActive : ""}`}
        >
          Imobiliárias
        </Link>
        <Link
          href="/admin?view=bookings"
          className={`${styles.viewTab} ${view === "bookings" ? styles.viewTabActive : ""}`}
        >
          Reservas
        </Link>
        <Link href="/admin?view=offers" className={`${styles.viewTab} ${view === "offers" ? styles.viewTabActive : ""}`}>
          Propostas
        </Link>
        <Link
          href="/admin?view=reviews"
          className={`${styles.viewTab} ${view === "reviews" ? styles.viewTabActive : ""}`}
        >
          Avaliações
        </Link>
        <Link href="/admin?view=logs" className={`${styles.viewTab} ${view === "logs" ? styles.viewTabActive : ""}`}>
          Log de auditoria
        </Link>
        <Link href="/admin?view=revenue" className={`${styles.viewTab} ${view === "revenue" ? styles.viewTabActive : ""}`}>
          Lucro
        </Link>
      </div>

      {view === "stats" ? (
        <StatsView token={token} />
      ) : view === "agencies" ? (
        <AgencyVerificationView
          token={token}
          accountsType={accountsType}
          verified={verified}
          search={search}
          page={page}
        />
      ) : view === "bookings" ? (
        <BookingsView token={token} status={status} page={page} />
      ) : view === "offers" ? (
        <OffersView token={token} status={status} page={page} />
      ) : view === "reviews" ? (
        <ReviewsView token={token} page={page} />
      ) : view === "logs" ? (
        <LogsView token={token} page={page} />
      ) : view === "revenue" ? (
        <RevenueView token={token} />
      ) : (
        <ModerationView token={token} status={status} page={page} />
      )}
    </main>
  );
}

async function StatsView({ token }: { token: string }) {
  const stats = await getAdminStats(token);

  const months = Object.keys(stats.bookingsByMonth).sort();
  const bookingsData = months.length
    ? months.map((m) => ({ label: monthLabel(m), value: stats.bookingsByMonth[m] }))
    : [{ label: "Sem dados", value: 0 }];

  return (
    <>
      <div className={styles.statsGrid}>
        <div className={styles.statTile}>
          <p className={styles.statValue}>{stats.totalUsers}</p>
          <p className={styles.statLabel}>Usuários</p>
        </div>
        <div className={styles.statTile}>
          <p className={styles.statValue}>{stats.totalListings}</p>
          <p className={styles.statLabel}>Imóveis</p>
        </div>
        <div className={styles.statTile}>
          <p className={styles.statValue} style={{ color: "#f59e0b" }}>
            {stats.listingsStatus.pending}
          </p>
          <p className={styles.statLabel}>Pendentes</p>
        </div>
        <div className={styles.statTile}>
          <p className={styles.statValue} style={{ color: "#22c55e" }}>
            {stats.listingsStatus.approved}
          </p>
          <p className={styles.statLabel}>Aprovados</p>
        </div>
        <div className={styles.statTile}>
          <p className={styles.statValue} style={{ color: "#ef4444" }}>
            {stats.listingsStatus.rejected}
          </p>
          <p className={styles.statLabel}>Rejeitados</p>
        </div>
      </div>

      <div className={styles.chartsGrid}>
        <LineChart title="Reservas mensais" data={bookingsData} color="#ff385c" format="number" />
      </div>
    </>
  );
}

async function ModerationView({ token, status, page }: { token: string; status: string; page: number }) {
  const [listingsPage, stats] = await Promise.all([
    getAdminListings(token, status, page),
    getAdminStats(token).catch(() => null),
  ]);

  const { listings, totalPages } = listingsPage;

  const getStatusCount = (val: string) => {
    if (!stats) return null;
    if (val === "PENDING") return stats.listingsStatus.pending;
    if (val === "APPROVED") return stats.listingsStatus.approved;
    if (val === "REJECTED") return stats.listingsStatus.rejected;
    if (val === "ALL") return stats.totalListings;
    return null;
  };

  const pendingCount = stats?.listingsStatus.pending ?? 0;
  const approvedCount = stats?.listingsStatus.approved ?? 0;
  const rejectedCount = stats?.listingsStatus.rejected ?? 0;
  const totalCount = stats?.totalListings ?? 0;

  return (
    <div className={styles.moderationContainer}>
      {/* Moderation Hero Header */}
      <div className={styles.moderationHeader}>
        <div className={styles.moderationBadgeRow}>
          <span className={styles.moderationBadge}>
            <ShieldCheck size={13} />
            Central de Controle & Moderação
          </span>
          {pendingCount > 0 && (
            <span
              style={{
                fontSize: "11px",
                fontWeight: 700,
                padding: "3px 9px",
                borderRadius: "var(--radius-full)",
                background: "rgba(245, 158, 11, 0.15)",
                color: "#b45309",
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
              }}
            >
              <span
                style={{
                  width: "6px",
                  height: "6px",
                  borderRadius: "50%",
                  background: "#f59e0b",
                  boxShadow: "0 0 0 2px rgba(245, 158, 11, 0.4)",
                }}
              />
              {pendingCount} {pendingCount === 1 ? "imóvel aguardando" : "imóveis aguardando"} revisão
            </span>
          )}
        </div>
        <h2 className={styles.moderationTitle}>Moderação e Conformidade de Imóveis</h2>
        <p className={styles.moderationSubtitle}>
          Analise minuciosamente os anúncios submetidos na plataforma. Garanta imagens de alta qualidade,
          veracidade nas informações de preço e localização, e aprove ou solicite ajustes com justificativa transparente.
        </p>
      </div>

      {/* KPI Metrics Quick Bar */}
      <div className={styles.kpiGrid}>
        <Link
          href="/admin?view=moderation&status=PENDING"
          className={`${styles.kpiCard} ${status === "PENDING" ? styles.kpiCardActive : ""}`}
          style={{ color: "#d97706" }}
        >
          <div className={styles.kpiMeta}>
            <span className={styles.kpiValue} style={{ color: "#d97706" }}>
              {pendingCount}
            </span>
            <span className={styles.kpiLabel}>Pendentes de Análise</span>
          </div>
          <div className={styles.kpiIconWrapper} style={{ background: "rgba(245, 158, 11, 0.12)", color: "#d97706" }}>
            <Clock size={20} />
          </div>
        </Link>

        <Link
          href="/admin?view=moderation&status=APPROVED"
          className={`${styles.kpiCard} ${status === "APPROVED" ? styles.kpiCardActive : ""}`}
          style={{ color: "#16a34a" }}
        >
          <div className={styles.kpiMeta}>
            <span className={styles.kpiValue} style={{ color: "#16a34a" }}>
              {approvedCount}
            </span>
            <span className={styles.kpiLabel}>Aprovados no Catálogo</span>
          </div>
          <div className={styles.kpiIconWrapper} style={{ background: "rgba(34, 197, 94, 0.12)", color: "#16a34a" }}>
            <CheckCircle2 size={20} />
          </div>
        </Link>

        <Link
          href="/admin?view=moderation&status=REJECTED"
          className={`${styles.kpiCard} ${status === "REJECTED" ? styles.kpiCardActive : ""}`}
          style={{ color: "#dc2626" }}
        >
          <div className={styles.kpiMeta}>
            <span className={styles.kpiValue} style={{ color: "#dc2626" }}>
              {rejectedCount}
            </span>
            <span className={styles.kpiLabel}>Rejeitados / Ajustes</span>
          </div>
          <div className={styles.kpiIconWrapper} style={{ background: "rgba(239, 68, 68, 0.12)", color: "#dc2626" }}>
            <AlertCircle size={20} />
          </div>
        </Link>

        <Link
          href="/admin?view=moderation&status=ALL"
          className={`${styles.kpiCard} ${status === "ALL" ? styles.kpiCardActive : ""}`}
          style={{ color: "#4f46e5" }}
        >
          <div className={styles.kpiMeta}>
            <span className={styles.kpiValue} style={{ color: "#4f46e5" }}>
              {totalCount}
            </span>
            <span className={styles.kpiLabel}>Total Geral Registrado</span>
          </div>
          <div className={styles.kpiIconWrapper} style={{ background: "rgba(99, 102, 241, 0.12)", color: "#4f46e5" }}>
            <Layers size={20} />
          </div>
        </Link>
      </div>

      {/* Control Bar: Filters & Counts */}
      <div className={styles.moderationControlBar}>
        <div className={styles.segmentedFilters}>
          {STATUS_TABS.map((tab) => {
            const Icon = tab.icon;
            const count = getStatusCount(tab.value);
            const isActive = status === tab.value;

            return (
              <Link
                key={tab.value}
                href={`/admin?view=moderation&status=${tab.value}`}
                className={`${styles.segmentedTab} ${isActive ? styles.segmentedTabActive : ""}`}
              >
                <Icon size={15} />
                <span>{tab.label}</span>
                {count !== null && <span className={styles.tabCount}>{count}</span>}
              </Link>
            );
          })}
        </div>

        <span className={styles.queueCounter}>
          {listings.length > 0 ? (
            <>Exibindo <strong>{listings.length}</strong> {listings.length === 1 ? "imóvel" : "imóveis"} nesta página</>
          ) : (
            <>Nenhum imóvel nesta visualização</>
          )}
        </span>
      </div>

      {/* Listings Grid or Empty State */}
      {listings.length === 0 ? (
        <div className={styles.emptyContainer}>
          <div className={styles.emptyIconWrapper}>
            <ShieldCheck size={32} />
          </div>
          <h3 className={styles.emptyTitle}>
            {status === "PENDING"
              ? "Tudo em dia! Fila de moderação limpa."
              : "Nenhum imóvel encontrado neste filtro."}
          </h3>
          <p className={styles.emptySubtitle}>
            {status === "PENDING"
              ? "Não existem anúncios aguardando análise de moderação neste momento."
              : "Não há registros disponíveis para os critérios selecionados."}
          </p>
          {status !== "ALL" && (
            <Link href="/admin?view=moderation&status=ALL" className={styles.emptyAction}>
              <span>Ver todos os imóveis</span>
            </Link>
          )}
        </div>
      ) : (
        <div className={styles.moderationGrid}>
          {listings.map((listing) => (
            <AdminListingCard key={listing.id} listing={listing} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className={styles.moderationPagination}>
          {page <= 1 ? (
            <span className={`${styles.pageNavBtn} ${styles.pageNavBtnDisabled}`}>
              <ChevronLeft size={15} />
              <span>Anterior</span>
            </span>
          ) : (
            <Link
              href={`/admin?view=moderation&status=${status}&page=${page - 1}`}
              className={styles.pageNavBtn}
            >
              <ChevronLeft size={15} />
              <span>Anterior</span>
            </Link>
          )}

          <span className={styles.pageCurrentBadge}>
            Página <strong>{page}</strong> de {totalPages}
          </span>

          {page >= totalPages ? (
            <span className={`${styles.pageNavBtn} ${styles.pageNavBtnDisabled}`}>
              <span>Próxima</span>
              <ChevronRight size={15} />
            </span>
          ) : (
            <Link
              href={`/admin?view=moderation&status=${status}&page=${page + 1}`}
              className={styles.pageNavBtn}
            >
              <span>Próxima</span>
              <ChevronRight size={15} />
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

async function AgencyVerificationView({
  token,
  accountsType,
  verified,
  search,
  page,
}: {
  token: string;
  accountsType: "users" | "organizations";
  verified: "true" | "false" | "ALL";
  search: string;
  page: number;
}) {
  const isOrganizations = accountsType === "organizations";
  const agencies = isOrganizations ? null : await getAdminAgencies(token, verified, page, search);
  const organizations = isOrganizations ? await getAdminOrganizations(token, verified, page) : null;
  const totalPages = isOrganizations ? organizations!.totalPages : agencies!.totalPages;

  return (
    <>
      <div className={styles.filters}>
        <Link
          href={`/admin?view=agencies&type=users&verified=${verified}`}
          className={`${styles.filterTab} ${!isOrganizations ? styles.filterTabActive : ""}`}
        >
          Contas individuais
        </Link>
        <Link
          href={`/admin?view=agencies&type=organizations&verified=${verified}`}
          className={`${styles.filterTab} ${isOrganizations ? styles.filterTabActive : ""}`}
        >
          Organizações
        </Link>
      </div>

      {!isOrganizations && (
        <form method="GET" className={styles.filters}>
          <input type="hidden" name="view" value="agencies" />
          <input type="hidden" name="type" value="users" />
          <input type="hidden" name="verified" value={verified} />
          <input
            type="search"
            name="q"
            defaultValue={search}
            placeholder="Buscar por nome ou e-mail…"
            className={styles.filterTab}
          />
        </form>
      )}

      <div className={styles.filters}>
        {VERIFIED_TABS.map((tab) => (
          <Link
            key={tab.value}
            href={`/admin?view=agencies&type=${accountsType}&verified=${tab.value}`}
            className={`${styles.filterTab} ${verified === tab.value ? styles.filterTabActive : ""}`}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {isOrganizations ? (
        organizations!.organizations.length === 0 ? (
          <p className={styles.empty}>Nenhuma organização encontrada para este filtro.</p>
        ) : (
          <div className={styles.listingsGrid}>
            {organizations!.organizations.map((organization) => (
              <OrganizationAccountCard key={organization.id} organization={organization} />
            ))}
          </div>
        )
      ) : agencies!.users.length === 0 ? (
        <p className={styles.empty}>Nenhuma imobiliária encontrada para este filtro.</p>
      ) : (
        <div className={styles.listingsGrid}>
          {agencies!.users.map((user) => (
            <AgencyAccountCard key={user.id} user={user} />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className={styles.pagination}>
          {page <= 1 ? (
            <span className={`${styles.pageLink} ${styles.pageLinkDisabled}`}>← Anterior</span>
          ) : (
            <Link
              href={`/admin?view=agencies&type=${accountsType}&verified=${verified}&page=${page - 1}`}
              className={styles.pageLink}
            >
              ← Anterior
            </Link>
          )}
          <span className={styles.pageInfo}>
            Página {page} de {totalPages}
          </span>
          {page >= totalPages ? (
            <span className={`${styles.pageLink} ${styles.pageLinkDisabled}`}>Próxima →</span>
          ) : (
            <Link
              href={`/admin?view=agencies&type=${accountsType}&verified=${verified}&page=${page + 1}`}
              className={styles.pageLink}
            >
              Próxima →
            </Link>
          )}
        </div>
      )}
    </>
  );
}
