/**
 * Preço efetivo de uma reserva: desconto pontual da reserva (se o dono aplicou um) > preço
 * travado na criação da reserva > preço atual do anúncio (fallback só pra reservas antigas de
 * antes do backfill/algum caso não coberto). Nunca recalcula a partir do desconto do anúncio.
 */
export function effectiveBookingPrice(
  booking: { price: number | null; discountedPrice: number | null },
  listingPrice: number
): number {
  return booking.discountedPrice ?? booking.price ?? listingPrice;
}
