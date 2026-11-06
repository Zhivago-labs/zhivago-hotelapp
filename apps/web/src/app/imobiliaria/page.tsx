import Link from "next/link";
import type { Metadata } from "next";
import { requireAuth } from "@/lib/session";
import { getMyOrganization, getOrganizationBuildings } from "@/lib/organizations-api";
import { getOrganizationLeads, getMyLeads, getOrganizationMetrics } from "@/lib/leads-api";
import { LeadStatusSelect } from "@/components/dashboard/LeadStatusSelect";
import { SlaBadge } from "@/components/dashboard/SlaBadge";
import { LineChart } from "@/components/dashboard/LineChart";
import type { Lead, LeadStatus } from "@zhivago/shared";
import type { MyOrganization } from "@/lib/organizations-api";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Pipeline de Leads" };

const ORG_WIDE_VIEW_ROLES = ["OWNER", "ADMIN", "MANAGER", "ASSISTANT"];
const MANAGE_ROLES = ["OWNER", "ADMIN", "MANAGER"]; // ASSISTANT tem a mesma visão org-wide, mas nunca gerencia

const COLUMNS: { status: LeadStatus; label: string }[] = [
  { status: "NEW", label: "Novo" },
  { status: "CONTACTED", label: "Contatado" },
  { status: "QUALIFIED", label: "Qualificado" },
  { status: "VISIT_SCHEDULED", label: "Visita agendada" },
  { status: "PROPOSAL", label: "Proposta" },
  { status: "NEGOTIATION", label: "Negociação" },
  { status: "WON", label: "Ganho" },
  { status: "LOST", label: "Perdido" },
];

const STATUS_LABELS: Record<LeadStatus, string> = Object.fromEntries(
  COLUMNS.map((c) => [c.status, c.label])
) as Record<LeadStatus, string>;

function formatHours(hours: number | null): string {
  if (hours === null) return "—";
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  return `${hours.toFixed(1)} h`;
}

function formatNextAction(task: Lead["tasks"][number]): string {
  if (!task.dueAt) return task.title;
  const due = new Date(task.dueAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  return `${task.title} · ${due}`;
}

type Props = {
  searchParams: Promise<{ view?: string; brokerId?: string; buildingId?: string; search?: string; status?: string; page?: string }>;
};

export default async function ImobiliariaPipelinePage({ searchParams }: Props) {
  const params = await searchParams;
  const { view: viewParam, brokerId, buildingId } = params;
  const search = params.search?.trim();
  const status = COLUMNS.some((column) => column.status === params.status) ? params.status : undefined;
  const pageNumber = Number(params.page);
  const page = Number.isSafeInteger(pageNumber) && pageNumber > 0 ? pageNumber : 1;
  const tabHref = (view: string) => {
    const query = new URLSearchParams({ view });
    for (const [key, value] of Object.entries({ brokerId, buildingId, search, status })) {
      if (value) query.set(key, value);
    }
    return `/imobiliaria?${query}`;
  };
  const { token } = await requireAuth("/imobiliaria");

  const membership = await getMyOrganization(token);
  if (!membership) {
    return (
      <main className={styles.main}>
        <p className={styles.restricted}>
          O pipeline de leads é exclusivo para quem pertence a uma organização.
        </p>
      </main>
    );
  }

  const hasOrgWideView = ORG_WIDE_VIEW_ROLES.includes(membership.role);
  const canManage = MANAGE_ROLES.includes(membership.role);
  const view = viewParam === "metricas" && hasOrgWideView ? "metricas" : "pipeline";

  return (
    <main className={styles.main}>
      <Link href="/equipe" className={styles.backLink}>
        ← Voltar à equipe
      </Link>
      <div className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>{membership.organization.name}</p>
          <h1 className={styles.title}>Central da imobiliária</h1>
          <p className={styles.subtitle}>Acompanhe oportunidades e organize o próximo atendimento.</p>
        </div>
        <Link href="/equipe" className={styles.filterButton}>Ver equipe →</Link>
      </div>

      {hasOrgWideView && (
        <div className={styles.viewTabs}>
          <Link
            href={tabHref("pipeline")}
            aria-current={view === "pipeline" ? "page" : undefined}
            className={`${styles.viewTab} ${view === "pipeline" ? styles.viewTabActive : ""}`}
          >
            Kanban
          </Link>
          <Link
            href={tabHref("metricas")}
            aria-current={view === "metricas" ? "page" : undefined}
            className={`${styles.viewTab} ${view === "metricas" ? styles.viewTabActive : ""}`}
          >
            Métricas
          </Link>
        </div>
      )}

      {view === "metricas" ? (
        <MetricsView token={token} />
      ) : (
        <PipelineView
          token={token}
          hasOrgWideView={hasOrgWideView}
          canManage={canManage}
          membership={membership}
          page={page}
          filters={{ brokerId, buildingId, search, status }}
        />
      )}
    </main>
  );
}

async function PipelineView({
  token,
  hasOrgWideView,
  canManage,
  filters,
  membership,
  page,
}: {
  token: string;
  hasOrgWideView: boolean;
  canManage: boolean;
  membership: MyOrganization;
  page: number;
  filters: { brokerId?: string; buildingId?: string; search?: string; status?: string };
}) {
  // Paginação do resultado completo; os filtros são preservados entre páginas.
  const [leadsResult, buildings] = await Promise.all([
    hasOrgWideView
      ? getOrganizationLeads(token, { ...filters, page, limit: 100 })
      : getMyLeads(token).then((items) => {
          const filtered = items.filter((lead) =>
            (!filters.search || lead.user.name.toLocaleLowerCase("pt-BR").includes(filters.search.toLocaleLowerCase("pt-BR"))) &&
            (!filters.status || lead.status === filters.status)
          );
          return { items: filtered, total: filtered.length, page: 1, limit: Math.max(1, filtered.length) };
        }),
    hasOrgWideView ? getOrganizationBuildings(token) : Promise.resolve([]),
  ]);
  const leads = leadsResult.items;
  const brokers = hasOrgWideView
    ? membership.organization.members.filter((m) => m.status === "ACTIVE" && m.role !== "ASSISTANT")
    : [];
  const activeLeads = leads.filter((lead) => lead.status !== "WON" && lead.status !== "LOST");
  const totalPages = Math.max(1, Math.ceil(leadsResult.total / leadsResult.limit));
  const pageHref = (nextPage: number) => {
    const query = new URLSearchParams({ view: "pipeline", page: String(nextPage) });
    for (const [key, value] of Object.entries(filters)) if (value) query.set(key, value);
    return `/imobiliaria?${query}`;
  };

  return (
    <>
      <p className={styles.subtitle}>
        {hasOrgWideView
          ? "Todos os leads da organização, agrupados por etapa do funil."
          : "Seus leads atualmente atribuídos, agrupados por etapa do funil."}
      </p>

      <div className={styles.statsGrid} aria-label="Resumo dos leads exibidos">
        {[
          ["Oportunidades no resultado", leadsResult.total],
          ["Em andamento nesta página", activeLeads.length],
          ["SLA vencido nesta página", activeLeads.filter((lead) => lead.slaStatus === "OVERDUE").length],
          ["Sem responsável nesta página", activeLeads.filter((lead) => !lead.assignments.length).length],
        ].map(([label, value]) => (
          <div className={styles.statTile} key={label}><p className={styles.statValue}>{value}</p><p className={styles.statLabel}>{label}</p></div>
        ))}
      </div>
        <form action="/imobiliaria" className={styles.filterBar} key={JSON.stringify(filters)}>
          <input type="hidden" name="view" value="pipeline" />
          {hasOrgWideView && <>
          <select aria-label="Corretor responsável" name="brokerId" defaultValue={filters.brokerId ?? ""} className={styles.filterInput}>
            <option value="">Todos os corretores</option>
            {brokers.map((b) => (
              <option key={b.id} value={b.id}>
                {b.user?.name ?? "Membro"}
              </option>
            ))}
          </select>
          <select aria-label="Empreendimento" name="buildingId" defaultValue={filters.buildingId ?? ""} className={styles.filterInput}>
            <option value="">Todos os empreendimentos</option>
            {buildings.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          </>}
          <select name="status" aria-label="Etapa do funil" defaultValue={filters.status ?? ""} className={styles.filterInput}>
            <option value="">Todas as etapas</option>
            {COLUMNS.map((column) => <option key={column.status} value={column.status}>{column.label}</option>)}
          </select>
          <input
            aria-label="Buscar pelo nome do cliente"
            type="search"
            name="search"
            placeholder="Buscar cliente…"
            defaultValue={filters.search ?? ""}
            className={styles.filterInput}
          />
          <button type="submit" className={styles.filterButton}>
            Filtrar
          </button>
          {(filters.brokerId || filters.buildingId || filters.search || filters.status) && (
            <Link href="/imobiliaria?view=pipeline" className={styles.filterButton}>
              Limpar
            </Link>
          )}
        </form>

      <div className={styles.resultBar}>
        <p>{leads.length} de {leadsResult.total} leads · Contagens por etapa referentes a esta página</p>
        {hasOrgWideView && (totalPages > 1 || page > 1) && <nav aria-label="Paginação dos leads" className={styles.pagination}>
          {page > 1 && <Link href={pageHref(Math.min(page - 1, totalPages))}>← Anterior</Link>}
          <span>Página {page} de {totalPages}</span>
          {page < totalPages && <Link href={pageHref(page + 1)}>Próxima →</Link>}
        </nav>}
      </div>
      {leads.length === 0 && <div className={styles.emptyState}>
        <h2>Nenhuma oportunidade nesta página</h2>
        <p>Ajuste os filtros ou volte ao início do pipeline.</p>
        <Link href="/imobiliaria" className={styles.filterButton}>Voltar ao pipeline</Link>
      </div>}
      <div className={styles.board} role="region" aria-label="Funil de oportunidades, role para ver todas as etapas" tabIndex={0}>
        {COLUMNS.map((column) => {
          const columnLeads = leads.filter((lead) => lead.status === column.status);
          return (
            <div key={column.status} className={styles.column} data-status={column.status}>
              <div className={styles.columnHeader}>
                <span>{column.label}</span>
                <span className={styles.columnCount}>{columnLeads.length}</span>
              </div>

              <div className={styles.columnBody}>
                {columnLeads.length === 0 ? (
                  <p className={styles.columnEmpty}>Nenhum lead aqui.</p>
                ) : (
                  columnLeads.map((lead) => {
                    const currentAssignment = lead.assignments[0];
                    return (
                      <div key={lead.id} className={styles.card} data-urgent={lead.status !== "WON" && lead.status !== "LOST" && lead.slaStatus === "OVERDUE"}>
                        <div className={styles.cardTopRow}>
                          <span className={styles.cardCustomer}>{lead.user.name}</span>
                          <SlaBadge status={lead.slaStatus} />
                        </div>
                        <span className={styles.cardListing}>{lead.listing.name}</span>
                        {hasOrgWideView && (
                          <span className={styles.cardBroker}>
                            {currentAssignment?.broker?.user?.name ?? "Não atribuído"}
                          </span>
                        )}
                        {lead.tasks[0] && (
                          <span className={styles.cardNextAction}>{formatNextAction(lead.tasks[0])}</span>
                        )}
                        {canManage || !hasOrgWideView ? (
                          <LeadStatusSelect leadId={lead.id} currentStatus={lead.status} />
                        ) : (
                          <span className={styles.cardBroker}>{STATUS_LABELS[lead.status]}</span>
                        )}
                        <Link href={`/imobiliaria/leads/${lead.id}`} className={styles.cardLink} aria-label={`Ver detalhes de ${lead.user.name}`}>
                          Ver detalhes →
                        </Link>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

async function MetricsView({ token }: { token: string }) {
  const metrics = await getOrganizationMetrics(token);

  return (
    <>
      <p className={styles.subtitle}>Funil, SLA de resposta e desempenho por corretor.</p>

      <div className={styles.statsGrid}>
        <div className={styles.statTile}>
          <p className={styles.statValue}>{metrics.totalLeads}</p>
          <p className={styles.statLabel}>Leads</p>
        </div>
        <div className={styles.statTile}>
          <p className={styles.statValue}>{(metrics.conversionRate * 100).toFixed(1)}%</p>
          <p className={styles.statLabel}>Conversão</p>
        </div>
        <div className={styles.statTile}>
          <p className={styles.statValue}>{formatHours(metrics.avgResponseHours)}</p>
          <p className={styles.statLabel}>Tempo médio de resposta</p>
        </div>
        <div className={styles.statTile}>
          <p className={styles.statValue}>
            {metrics.slaCompliancePct === null ? "—" : `${metrics.slaCompliancePct.toFixed(0)}%`}
          </p>
          <p className={styles.statLabel}>Dentro do SLA</p>
        </div>
        <div className={styles.statTile}>
          <p className={styles.statValue} style={{ color: "#22c55e" }}>
            {metrics.wonCount}
          </p>
          <p className={styles.statLabel}>Ganhos</p>
        </div>
        <div className={styles.statTile}>
          <p className={styles.statValue} style={{ color: "#ef4444" }}>
            {metrics.lostCount}
          </p>
          <p className={styles.statLabel}>Perdidos</p>
        </div>
      </div>

      <div className={styles.chartsGrid}>
        <LineChart title="Leads por mês" data={metrics.leadsPerMonth} color="#ff385c" format="number" />
      </div>

      <div className={styles.funnelRow}>
        {COLUMNS.map((column) => {
          const count = metrics.funnelCounts.find((f) => f.status === column.status)?.count ?? 0;
          return (
            <div key={column.status} className={styles.funnelTile}>
              <span className={styles.funnelCount}>{count}</span>
              <span className={styles.funnelLabel}>{STATUS_LABELS[column.status]}</span>
            </div>
          );
        })}
      </div>

      <div className={styles.brokerTableWrap}>
        <table className={styles.brokerTable}>
          <thead>
            <tr>
              <th>Corretor</th>
              <th>Leads atribuídos</th>
              <th>Ganhos</th>
              <th>Tempo médio de resposta</th>
            </tr>
          </thead>
          <tbody>
            {metrics.byBroker.length === 0 && <tr><td colSpan={4}>Ainda não há dados de corretores para exibir.</td></tr>}
            {metrics.byBroker.map((broker) => (
              <tr key={broker.memberId}>
                <td>{broker.name}</td>
                <td>{broker.assignedCount}</td>
                <td>{broker.wonCount}</td>
                <td>{formatHours(broker.avgResponseHours)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
