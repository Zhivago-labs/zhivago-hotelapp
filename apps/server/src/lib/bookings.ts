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

// ─── FASE DA RESERVA ─────────────────────────────────────────────────────────────────────────
// O banco só guarda PENDING/CONFIRMED/CANCELLED/REJECTED; "finalizada" e "expirada" dependem da
// data e por isso são calculadas na hora (sem job agendado). As datas chegam do calendário como
// "YYYY-MM-DD" → meia-noite UTC do dia; +3h = meia-noite de Brasília daquele dia.
// Mesma regra em apps/web/src/lib/booking-phase.ts e apps/mobile/src/utils/bookingPhase.ts.

const DAY_MS = 24 * 60 * 60 * 1000;
const BRT_OFFSET_MS = 3 * 60 * 60 * 1000;

export type BookingPhase = 'PENDING' | 'EXPIRED' | 'CONFIRMED' | 'FINISHED' | 'CANCELLED' | 'REJECTED';

type PhaseInput = { status: string; startDate: Date | string; endDate: Date | string };

/** Estadia confirmada cujo dia do check-out já chegou — só resta avaliar. */
export function isStayFinished(booking: PhaseInput, now: Date = new Date()): boolean {
  return booking.status === 'CONFIRMED' && now.getTime() >= new Date(booking.endDate).getTime() + BRT_OFFSET_MS;
}

/** Pedido nunca respondido cujo dia do check-in já passou — não pode mais ser aprovado. */
export function isRequestExpired(booking: PhaseInput, now: Date = new Date()): boolean {
  return booking.status === 'PENDING' && now.getTime() >= new Date(booking.startDate).getTime() + DAY_MS + BRT_OFFSET_MS;
}

export function bookingPhase(booking: PhaseInput, now: Date = new Date()): BookingPhase {
  if (isStayFinished(booking, now)) return 'FINISHED';
  if (isRequestExpired(booking, now)) return 'EXPIRED';
  return booking.status as BookingPhase;
}
