import Link from "next/link";
import { requireWorkspace, workspaceFetch } from "@/lib/workspace";
import type { WorkspaceOverview } from "@/lib/workspace-types";
import styles from "@/components/workspace/Workspace.module.css";
export const metadata = { title: "Início da imobiliária" };
export default async function WorkspaceHome({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const { token } = await requireWorkspace();
  const params = await searchParams;
  const days = ["7", "30", "90"].includes(params.days || "") ? params.days! : "30";
  const data = await workspaceFetch<WorkspaceOverview>(token, `/organizations/workspace?days=${days}`);
  return <main className={styles.page}>
    <div className={styles.header}><div><h1>Visão geral</h1><p className={styles.muted}>{data.scope === "organization" ? "Operação de toda a imobiliária" : "Seus imóveis e oportunidades atribuídos"} · Dados reais de atendimento</p></div>
      <form className={styles.filters}><label htmlFor="period">Período</label><select id="period" name="days" defaultValue={days}><option value="7">Últimos 7 dias</option><option value="30">Últimos 30 dias</option><option value="90">Últimos 90 dias</option></select><button>Aplicar</button></form>
    </div>
    <div className={styles.metrics}>
      {[[data.newLeads, "Novas oportunidades no período"], [data.uniqueContacts, "Pessoas com novas oportunidades"], [data.pendingCount, "Atendimentos pendentes agora"], [data.published, "Imóveis publicados agora"]].map(([value, label]) => <div className={styles.metric} key={label}><strong>{value}</strong><span>{label}</span></div>)}
    </div>
    <p className={styles.muted}>Oportunidade = um cliente interessado em um imóvel. Pendentes = oportunidades abertas novas ou sem responsável, em todo o histórico. Publicados = anúncios aprovados disponíveis.</p>
    <p className={styles.muted}>Primeiro atendimento registrado: {data.contactedRate === null ? "sem dados no período" : `${(data.contactedRate * 100).toFixed(1)}% das novas oportunidades`}. Esse indicador mede atendimento, não receita nem conversão de visualizações em contatos.</p>
    <div className={styles.sections} style={{ marginTop: 24 }}>
      <section className={styles.panel}><h2>Aguardando atendimento</h2>{data.pending.length ? <ul className={styles.list}>{data.pending.map(lead => <li key={lead.id}><Link href={`/imobiliaria/leads/${lead.id}`}>{lead.user.name}</Link><p>{lead.listing.name}</p></li>)}</ul> : <p className={styles.empty}>Nenhum atendimento pendente.</p>}<Link href="/imobiliaria">Abrir Kanban</Link></section>
      <section className={styles.panel}><h2>Próximas visitas</h2>{data.visits.length ? <ul className={styles.list}>{data.visits.map(visit => <li key={visit.id}><Link href={`/imobiliaria/leads/${visit.lead.id}`}>{visit.lead.user.name} · {visit.lead.listing.name}</Link><p>{new Date(visit.scheduledAt).toLocaleString("pt-BR")}</p></li>)}</ul> : <p className={styles.empty}>Nenhuma visita agendada.</p>}{data.hasSeason && <><h2 style={{ marginTop:20 }}>Próximas reservas</h2>{data.upcomingBookings.length ? <ul className={styles.list}>{data.upcomingBookings.map(booking => <li key={booking.id}><Link href="/empresa/reservas">{booking.user.name} · {booking.listing.name}</Link><p>{new Date(booking.startDate).toLocaleDateString("pt-BR")}</p></li>)}</ul> : <p className={styles.empty}>Nenhuma próxima reserva.</p>}<Link href="/empresa/reservas">Consultar reservas de temporada</Link></>}</section>
    </div>
    <section className={styles.panel}><h2>Imóveis com mais visualizações</h2><p className={styles.muted}>Visualizações e oportunidades acumuladas em todo o histórico. O sistema não registra o histórico diário de visualizações.</p>{data.topListings.length ? <ul className={styles.list}>{data.topListings.map(listing => <li key={listing.id}><Link href="/empresa/imoveis">{listing.name}</Link> · {listing.viewCount} visualizações · {listing._count.leads} oportunidades</li>)}</ul> : <p className={styles.empty}>Nenhum imóvel disponível neste escopo.</p>}</section>
    <section className={styles.panel}><h2>Imóveis com mais contatos</h2><p className={styles.muted}>Clientes interessados por imóvel, em todo o histórico. Um cliente com dois imóveis conta uma vez em cada imóvel.</p>{data.topContactListings.length ? <ul className={styles.list}>{data.topContactListings.map(listing => <li key={listing.id}><Link href="/empresa/imoveis">{listing.name}</Link> · {listing._count.leads} contatos</li>)}</ul> : <p className={styles.empty}>Nenhum imóvel neste escopo.</p>}</section>
    <section className={styles.panel}><h2>Evolução das novas oportunidades</h2>{Object.keys(data.trend).length ? <ul className={styles.list}>{Object.entries(data.trend).sort(([a],[b]) => a.localeCompare(b)).map(([date, count]) => <li key={date}><time dateTime={date}>{new Date(`${date}T12:00:00Z`).toLocaleDateString("pt-BR", { timeZone: "UTC" })}</time> · {count} {count === 1 ? "oportunidade" : "oportunidades"}</li>)}</ul> : <p className={styles.empty}>Nenhuma nova oportunidade neste período.</p>}</section>
  </main>;
}
