import { getApiUrl } from "@/lib/api";
import type { Lead, LeadDetail, OrganizationMetrics } from "@zhivago/shared";

export async function getOrganizationLeads(token: string, status?: string): Promise<Lead[]> {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
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
