import { getApiUrl } from "@/lib/api";
import type { Organization, OrganizationMemberRole, OrganizationInvite } from "@zhivago/shared";
import type { OwnedListing } from "@/lib/listings-api";

export interface MyOrganization {
  role: OrganizationMemberRole;
  organization: Organization;
}

export async function getMyOrganization(token: string): Promise<MyOrganization | null> {
  const res = await fetch(`${getApiUrl()}/organizations/me`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Falha ao buscar organização (${res.status})`);
  return res.json();
}

export interface OrganizationListing extends OwnedListing {
  agent: { id: string; name: string; email: string; avatar: string | null } | null;
}

export async function getOrganizationListings(token: string): Promise<OrganizationListing[]> {
  const res = await fetch(`${getApiUrl()}/organizations/listings`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Falha ao buscar imóveis da organização (${res.status})`);
  return res.json();
}

export async function getMyAssignedListings(token: string): Promise<OwnedListing[]> {
  const res = await fetch(`${getApiUrl()}/organizations/my-assigned-listings`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Falha ao buscar imóveis atribuídos (${res.status})`);
  return res.json();
}

export async function getOrganizationInvites(token: string): Promise<OrganizationInvite[]> {
  const res = await fetch(`${getApiUrl()}/organizations/invites`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Falha ao buscar convites (${res.status})`);
  return res.json();
}

export async function getMyPendingInvites(token: string): Promise<OrganizationInvite[]> {
  const res = await fetch(`${getApiUrl()}/organizations/invites/me`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Falha ao buscar convites pendentes (${res.status})`);
  return res.json();
}
