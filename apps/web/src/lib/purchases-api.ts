import type { PurchasedProperty } from '@zhivago/shared';
import { getApiUrl } from './api';

export async function getMyPurchases(token: string): Promise<PurchasedProperty[]> {
  const response = await fetch(`${getApiUrl()}/users/me/purchases`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('Não foi possível carregar seus imóveis comprados.');
  return response.json();
}
