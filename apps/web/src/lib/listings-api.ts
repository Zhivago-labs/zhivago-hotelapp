import { getApiUrl } from "@/lib/api";
import type { ListingImage } from "@zhivago/shared";

export interface OwnedListing {
  id: string;
  name: string;
  description: string | null;
  price: number;
  originalPrice?: number | null;
  type: string;
  category: string;
  billingCycle: string | null;
  images: ListingImage[];
  location: string;
  bedrooms: number;
  bathrooms: number;
  parking: number;
  amenities?: string | null;
  status: string;
  viewCount: number;
  _count: { conversations: number };
  createdAt: string;
  updatedAt: string;
}

export async function getMyListings(token: string): Promise<OwnedListing[]> {
  const res = await fetch(`${getApiUrl()}/me/listings`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Falha ao buscar seus imóveis (${res.status})`);
  return res.json();
}

export interface MyStats {
  statusCounts: { pending: number; approved: number; rejected: number };
  bookingsByMonth: Record<string, number>;
  revenueByMonth: Record<string, number>;
  propertyRatings: Array<{ name: string; average: number }>;
  rentalRevenue: number;
  salesRevenue: number;
}

export async function getMyStats(token: string): Promise<MyStats> {
  const res = await fetch(`${getApiUrl()}/users/me/stats`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Falha ao buscar estatísticas (${res.status})`);
  return res.json();
}

export interface ReceivedBooking {
  id: string;
  startDate: string;
  endDate: string;
  status: string;
  price: number;
  discountedPrice: number | null;
  listing: { id: string; name: string; image: string; price: number };
  user: { name: string; avatar: string | null; email: string; phone: string | null };
}

export interface ReceivedBookingsPage {
  bookings: ReceivedBooking[];
  total: number;
  page: number;
  totalPages: number;
}

export async function getReceivedBookings(
  token: string,
  page: number,
  search: string
): Promise<ReceivedBookingsPage> {
  const params = new URLSearchParams({ page: String(page), search });
  const res = await fetch(`${getApiUrl()}/users/me/received-bookings?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Falha ao buscar reservas recebidas (${res.status})`);
  return res.json();
}
