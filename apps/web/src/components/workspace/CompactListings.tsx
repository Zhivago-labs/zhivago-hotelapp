"use client";
import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { MoreHoriz, EditPencil, Search, Building } from "iconoir-react";
import type { OwnedListing } from "@/lib/listings-api";
import { ActionForm } from "@/components/ActionForm";
import { ConfirmSubmitButton } from "@/components/dashboard/ConfirmSubmitButton";
import { DiscountModal } from "@/components/dashboard/DiscountModal";
import { RejectListingButton } from "@/components/admin/RejectListingButton";
import { deleteListingAction, publishListingAction, unpublishListingAction, duplicateListingAction, approveOrgListingAction, relistListingAction, rejectOrgListingAction } from "@/lib/actions/listings";
import styles from "./Workspace.module.css";
const statusLabels: Record<string, string> = { DRAFT: "Rascunho", PENDING: "Em análise", APPROVED: "Publicado", REJECTED: "Rejeitado", SOLD: "Vendido", RENTED: "Alugado" };
const operations: Record<string, string> = { SALE: "Venda", MONTHLY_RENT: "Aluguel", DAILY_RENT: "Temporada" };
export function CompactListings({ listings, role, userId, initialStatus = "" }: { listings: OwnedListing[]; role: string; userId: string; initialStatus?: string }) {
  const [query, setQuery] = useState("");
  const [operation, setOperation] = useState("");
  const [status, setStatus] = useState(initialStatus);
  const [agent, setAgent] = useState("");
  const [discount, setDiscount] = useState<OwnedListing | null>(null);
  const admin = ["OWNER", "ADMIN"].includes(role);
  const filtered = listings.filter(item => (!query || `${item.name} ${item.location}`.toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR"))) && (!operation || item.operationType === operation) && (!status || item.status === status) && (!agent || item.agentId === agent));
  const agents = new Map(listings.filter(item => item.agent).map(item => [item.agent!.id, item.agent!.name]));
  return <>
    <div className={styles.filters}><Search width={18} height={18} aria-hidden="true" /><input type="search" aria-label="Buscar imóvel" placeholder="Nome ou localização" value={query} onChange={event => setQuery(event.target.value)} /><select aria-label="Modalidade" value={operation} onChange={event => setOperation(event.target.value)}><option value="">Todas as modalidades</option>{Object.entries(operations).map(([id,label]) => <option key={id} value={id}>{label}</option>)}</select><select aria-label="Status" value={status} onChange={event => setStatus(event.target.value)}><option value="">Todos os status</option>{Object.entries(statusLabels).map(([id,label]) => <option key={id} value={id}>{label}</option>)}</select><select aria-label="Responsável pelo imóvel" value={agent} onChange={event => setAgent(event.target.value)}><option value="">Todos os responsáveis</option>{[...agents].map(([id,name]) => <option key={id} value={id}>{name}</option>)}</select></div>
    <p className={styles.muted} role="status">{filtered.length} imóveis encontrados</p>
    {filtered.length ? <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Imóvel</th><th>Modalidade / preço</th><th>Status</th><th>Responsável</th><th>Visualizações</th><th>Contatos</th><th>Ações</th></tr></thead><tbody>{filtered.map(item => {
      const canEdit = admin || (role === "BROKER" && item.agentId === userId);
      const currency = item.price.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
      const suffix = item.operationType === "DAILY_RENT" ? " / noite" : item.operationType === "MONTHLY_RENT" ? " / mês" : "";
      return <tr key={item.id}><td><div className={styles.property}>{item.images[0] ? <Image unoptimized src={item.images[0].url} alt="" width={60} height={48} loading="lazy" /> : <Building width={36} height={36} aria-hidden="true" />}<div><strong>{item.name}</strong><p className={styles.muted}>{item.location}</p></div></div></td><td data-label="Modalidade"><p>{operations[item.operationType || ""] || (item.category === "venda" ? "Venda" : "Aluguel")}</p>{currency}{suffix}</td><td data-label="Status">{statusLabels[item.status] || item.status}</td><td data-label="Responsável">{item.agent?.name || "Não atribuído"}</td><td data-label="Visualizações">{item.viewCount}</td><td data-label="Contatos">{item._count.leads ?? 0}</td><td><div className={styles.filters} style={{ margin:0 }}>
        {canEdit ? <Link href={`/anuncios/${item.id}/editar`}><EditPencil width={18} height={18} aria-hidden="true" /> Editar</Link> : item.status === "APPROVED" ? <Link href={`/imovel/${item.id}`}>Visualizar</Link> : <span className={styles.muted}>Somente leitura</span>}
        {canEdit && <details className={styles.context}><summary aria-label={`Mais ações para ${item.name}`}><MoreHoriz width={20} height={20} /></summary><div>
          <ActionForm action={duplicateListingAction}><input type="hidden" name="id" value={item.id} /><button type="submit">Duplicar</button></ActionForm>
          <button type="button" onClick={() => setDiscount(item)}>Aplicar desconto</button>
          {item.status === "DRAFT" && <ActionForm action={publishListingAction}><input type="hidden" name="id" value={item.id} /><button type="submit">Enviar para publicação</button></ActionForm>}
          {item.status === "APPROVED" && <ActionForm action={unpublishListingAction}><input type="hidden" name="id" value={item.id} /><ConfirmSubmitButton confirmMessage={`Despublicar ${item.name}?`}>Despublicar</ConfirmSubmitButton></ActionForm>}
          {item.status === "RENTED" && <ActionForm action={relistListingAction}><input type="hidden" name="id" value={item.id} /><button type="submit">Disponibilizar novamente</button></ActionForm>}
          {admin && item.status === "PENDING" && <><ActionForm action={approveOrgListingAction}><input type="hidden" name="id" value={item.id} /><button type="submit">Aprovar anúncio</button></ActionForm><ActionForm action={rejectOrgListingAction}><input type="hidden" name="id" value={item.id} /><input type="hidden" name="reason" /><RejectListingButton listingName={item.name} className={styles.danger} /></ActionForm></>}
          {admin && <><Link href="/equipe">Redistribuir responsável</Link><ActionForm action={deleteListingAction}><input type="hidden" name="id" value={item.id} /><ConfirmSubmitButton className={styles.danger} confirmMessage={`Excluir ${item.name}? Esta ação não pode ser desfeita.`}>Excluir anúncio</ConfirmSubmitButton></ActionForm></>}
        </div></details>}
      </div></td></tr>;
    })}</tbody></table></div> : <p className={styles.empty}>{listings.length ? "Nenhum imóvel para os filtros selecionados." : "Nenhum imóvel neste escopo."}</p>}
    {discount && <DiscountModal listing={discount} onClose={() => setDiscount(null)} />}
  </>;
}
