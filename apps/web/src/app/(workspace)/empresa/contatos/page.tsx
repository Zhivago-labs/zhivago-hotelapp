import Link from "next/link";
import { requireWorkspace, workspaceFetch } from "@/lib/workspace";
import type { WorkspaceContacts } from "@/lib/workspace-types";
import styles from "@/components/workspace/Workspace.module.css";
const stageLabels: Record<string, string> = { NEW: "Novo", CONTACTED: "Contatado", QUALIFIED: "Qualificado", VISIT_SCHEDULED: "Visita agendada", PROPOSAL: "Proposta", NEGOTIATION: "Negociação", WON: "Ganho", LOST: "Perdido" };
export const metadata = { title: "Contatos da imobiliária" };
export default async function Contacts({ searchParams }: { searchParams: Promise<{ search?: string; page?: string }> }) {
  const { token } = await requireWorkspace("/empresa/contatos");
  const params = await searchParams;
  const query = new URLSearchParams({ search: params.search?.slice(0,120) || "", page: String(Math.max(1, Math.floor(Number(params.page) || 1))) });
  const data = await workspaceFetch<WorkspaceContacts>(token, `/organizations/contacts?${query}`);
  const pageHref = (page: number) => { const next = new URLSearchParams(query); next.set("page", String(page)); return `/empresa/contatos?${next}`; };
  return <main className={styles.page}><h1>Contatos</h1><p className={styles.muted}>Pessoas e suas oportunidades visíveis na imobiliária. Cada cadastro de cliente aparece uma vez, mesmo com interesses em vários imóveis.</p>
    <form className={styles.filters}><input type="search" name="search" aria-label="Buscar por nome ou e-mail" placeholder="Nome ou e-mail" defaultValue={params.search || ""} /><button>Buscar</button></form>
    <p className={styles.muted}>{data.total} contatos encontrados</p>
    {data.items.length ? <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Contato</th><th>Canais</th><th>Oportunidades</th></tr></thead><tbody>{data.items.map(contact => <tr key={contact.id}><td><strong>{contact.name}</strong></td><td data-label="Canais"><a href={`mailto:${contact.email}`}>{contact.email}</a>{contact.phone && <p><a href={`tel:${contact.phone.replace(/[^+\d]/g, "")}`}>{contact.phone}</a></p>}</td><td data-label="Oportunidades"><ul className={styles.list}>{contact.leads.map(lead => <li key={lead.id}><Link href={`/imobiliaria/leads/${lead.id}`}>{lead.listing.name}</Link> · {stageLabels[lead.status] || lead.status}{lead.conversations.map(conversation => <p key={conversation.id}><Link href={`/empresa/mensagens?openChat=${conversation.id}`}>Abrir conversa</Link></p>)}</li>)}</ul></td></tr>)}</tbody></table></div> : <p className={styles.empty}>{params.search ? "Nenhum contato para esta busca." : "Nenhum contato recebido ainda."}</p>}
    <nav className={styles.pagination} aria-label="Páginas de contatos">{data.page > 1 && <Link href={pageHref(data.page - 1)}>Anterior</Link>}<span>Página {data.page} de {Math.max(1, Math.ceil(data.total / data.limit))}</span>{data.page * data.limit < data.total && <Link href={pageHref(data.page + 1)}>Próxima</Link>}</nav>
  </main>;
}
