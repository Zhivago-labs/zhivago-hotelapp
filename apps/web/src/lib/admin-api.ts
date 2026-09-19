import { getApiUrl } from "@/lib/api";
import type { ListingImage } from "@zhivago/shared";

export interface AdminStats {
  totalUsers: number;
  totalListings: number;
  listingsStatus: { pending: number; approved: number; rejected: number };
  bookingsByMonth: Record<string, number>;
}

export async function getAdminStats(token: string): Promise<AdminStats> {
  const res = await fetch(`${getApiUrl()}/admin/stats`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Falha ao buscar estatísticas (${res.status})`);
  return res.json();
}

export interface AdminListing {
  id: string;
  name: string;
  location: string;
  price: number;
  category: string;
  billingCycle: string | null;
  images: ListingImage[];
  status: string;
  owner: { id: string; name: string; email: string } | null;
  createdAt: string;
}

export interface AdminListingsPage {
  listings: AdminListing[];
  total: number;
  page: number;
  totalPages: number;
}

export async function getAdminListings(
  token: string,
  status: string,
  page: number
): Promise<AdminListingsPage> {
  const params = new URLSearchParams({ page: String(page) });
  if (status !== "ALL") params.set("status", status);

  const res = await fetch(`${getApiUrl()}/admin/listings?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Falha ao buscar imóveis (${res.status})`);
  return res.json();
}

export interface AdminAgencyUser {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  companyName: string | null;
  creci: string | null;
  document: string | null;
  verified: boolean;
  createdAt: string;
}

export interface AdminAgenciesPage {
  users: AdminAgencyUser[];
  total: number;
  page: number;
  totalPages: number;
}

export async function getAdminAgencies(
  token: string,
  verified: "true" | "false" | "ALL",
  page: number,
  search?: string
): Promise<AdminAgenciesPage> {
  const params = new URLSearchParams({ accountType: "AGENCY", page: String(page) });
  if (verified !== "ALL") params.set("verified", verified);
  if (search) params.set("search", search);

  const res = await fetch(`${getApiUrl()}/admin/users?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Falha ao buscar imobiliárias (${res.status})`);
  return res.json();
}

// ─── ORGANIZAÇÕES (B2B) — segunda visão de "conta pra verificar" ─────────────

export interface AdminOrganization {
  id: string;
  name: string;
  document: string;
  verified: boolean;
  createdAt: string;
  members: Array<{ user: { id: string; name: string; email: string; phone: string | null } }>;
}

export interface AdminOrganizationsPage {
  organizations: AdminOrganization[];
  total: number;
  page: number;
  totalPages: number;
}

export async function getAdminOrganizations(
  token: string,
  verified: "true" | "false" | "ALL",
  page: number
): Promise<AdminOrganizationsPage> {
  const params = new URLSearchParams({ page: String(page) });
  if (verified !== "ALL") params.set("verified", verified);

  const res = await fetch(`${getApiUrl()}/admin/organizations?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Falha ao buscar organizações (${res.status})`);
  return res.json();
}

// ─── RESERVAS (visão do admin) ────────────────────────────────────────────────

export interface AdminBooking {
  id: string;
  startDate: string;
  endDate: string;
  status: string;
  createdAt: string;
  listing: { id: string; name: string };
  user: { id: string; name: string; email: string };
}

export interface AdminBookingsPage {
  bookings: AdminBooking[];
  total: number;
  page: number;
  totalPages: number;
}

export async function getAdminBookings(
  token: string,
  status: string,
  page: number
): Promise<AdminBookingsPage> {
  const params = new URLSearchParams({ page: String(page) });
  if (status !== "ALL") params.set("status", status);

  const res = await fetch(`${getApiUrl()}/admin/bookings?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Falha ao buscar reservas (${res.status})`);
  return res.json();
}

// ─── PROPOSTAS (visão do admin — apenas leitura) ─────────────────────────────

export interface AdminOffer {
  id: string;
  value: number;
  paymentMethod: string;
  status: string;
  createdAt: string;
  listing: { id: string; name: string };
  buyer: { id: string; name: string; email: string };
}

export interface AdminOffersPage {
  offers: AdminOffer[];
  total: number;
  page: number;
  totalPages: number;
}

export async function getAdminOffers(
  token: string,
  status: string,
  page: number
): Promise<AdminOffersPage> {
  const params = new URLSearchParams({ page: String(page) });
  if (status !== "ALL") params.set("status", status);

  const res = await fetch(`${getApiUrl()}/admin/offers?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Falha ao buscar propostas (${res.status})`);
  return res.json();
}

// ─── AVALIAÇÕES (moderação do admin) ─────────────────────────────────────────

export interface AdminReview {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  listing: { id: string; name: string };
  user: { id: string; name: string; email: string };
}

export interface AdminReviewsPage {
  reviews: AdminReview[];
  total: number;
  page: number;
  totalPages: number;
}

export async function getAdminReviews(token: string, page: number): Promise<AdminReviewsPage> {
  const params = new URLSearchParams({ page: String(page) });

  const res = await fetch(`${getApiUrl()}/admin/reviews?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Falha ao buscar avaliações (${res.status})`);
  return res.json();
}

// ─── LOG DE AUDITORIA ─────────────────────────────────────────────────────────

export interface AdminActionLog {
  id: string;
  action: string;
  targetType: string;
  targetId: string | null;
  reason: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  admin: { id: string; name: string; email: string };
}

export interface AdminActionLogsPage {
  logs: AdminActionLog[];
  total: number;
  page: number;
  totalPages: number;
}

export async function getAdminLogs(token: string, page: number): Promise<AdminActionLogsPage> {
  const params = new URLSearchParams({ page: String(page) });

  const res = await fetch(`${getApiUrl()}/admin/logs?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Falha ao buscar log de auditoria (${res.status})`);
  return res.json();
}

// ─── RECEITA (GMV — volume transacionado pela plataforma) ────────────────────

export interface AdminRevenue {
  totalRentalRevenue: number;
  totalSalesRevenue: number;
  totalRevenue: number;
  monthly: Record<string, { rental: number; sales: number }>;
}

export async function getAdminRevenue(token: string): Promise<AdminRevenue> {
  const res = await fetch(`${getApiUrl()}/admin/revenue`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Falha ao buscar receita (${res.status})`);
  return res.json();
}
