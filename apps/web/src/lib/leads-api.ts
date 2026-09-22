import { getApiUrl } from "@/lib/api";
import type { Lead, LeadDetail, OrganizationMetrics, PaginatedLeads } from "@zhivago/shared";

// Filtros e paginação server-side (seção 118/119 da spec) — antes trazia a organização inteira e
// filtrava em memória. O Kanban continua mostrando o funil inteiro de uma vez (não pagina por
// coluna), então usa um `limit` generoso por padrão; os filtros é que reduzem o conjunto.
export interface OrganizationLeadsFilters {
  status?: string;
  brokerId?: string;
  buildingId?: string;
  search?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export async function getOrganizationLeads(token: string, filters: OrganizationLeadsFilters = {}): Promise<PaginatedLeads> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  const query = params.toString() ? `?${params.toString()}` : "";
  const res = await fetch(`${getApiUrl()}/leads${query}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Falha ao buscar leads da organização (${res.status})`);
  return res.json();
}

export async function getMyLeads(token: string): Promise<Lead[]> {
  const res = await fetch(`${getApiUrl()}/leads/mine`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Falha ao buscar meus leads (${res.status})`);
  return res.json();
}

export async function getLeadDetail(token: string, id: string): Promise<LeadDetail | null> {
  const res = await fetch(`${getApiUrl()}/leads/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (res.status === 403 || res.status === 404) return null;
  if (!res.ok) throw new Error(`Falha ao buscar detalhe do lead (${res.status})`);
  return res.json();
}

export async function getOrganizationMetrics(token: string): Promise<OrganizationMetrics> {
  const res = await fetch(`${getApiUrl()}/organizations/metrics`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Falha ao buscar métricas da organização (${res.status})`);
  return res.json();
}
