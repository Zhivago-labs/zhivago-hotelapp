// Fase da reserva — mesma regra de apps/server/src/lib/bookings.ts (o servidor já manda `phase`
// nas listas de reservas; aqui é pra quem só tem as datas, como os cards de reserva do chat).
// As datas chegam como "YYYY-MM-DD" → meia-noite UTC; +3h = meia-noite de Brasília daquele dia.

export type BookingPhase = 'PENDING' | 'EXPIRED' | 'CONFIRMED' | 'FINISHED' | 'CANCELLED' | 'REJECTED';

const DAY_MS = 24 * 60 * 60 * 1000;
const BRT_OFFSET_MS = 3 * 60 * 60 * 1000;

/** Estadia cujo dia do check-out já chegou (só faz sentido pra reserva confirmada). */
export function isStayOver(endDate: string, now: Date = new Date()): boolean {
  return now.getTime() >= new Date(endDate).getTime() + BRT_OFFSET_MS;
}

/** Dia do check-in já passou — pedido ainda pendente não pode mais ser aprovado. */
export function isCheckInOver(startDate: string, now: Date = new Date()): boolean {
  return now.getTime() >= new Date(startDate).getTime() + DAY_MS + BRT_OFFSET_MS;
}

export function bookingPhase(booking: { status: string; startDate: string; endDate: string; phase?: string }): BookingPhase {
  if (booking.phase) return booking.phase as BookingPhase;
  if (booking.status === 'CONFIRMED' && isStayOver(booking.endDate)) return 'FINISHED';
  if (booking.status === 'PENDING' && isCheckInOver(booking.startDate)) return 'EXPIRED';
  return booking.status as BookingPhase;
}

/** Selo de status das listas de reservas (hóspede e anfitrião). */
export function bookingStatusInfo(phase: BookingPhase): { label: string; bg: string; text: string } {
  if (phase === 'CANCELLED') return { label: 'Cancelada', bg: '#f5f5f5', text: '#d32f2f' };
  if (phase === 'REJECTED') return { label: 'Recusada', bg: '#f5f5f5', text: '#d32f2f' };
  if (phase === 'PENDING') return { label: 'Pendente', bg: '#fff3e0', text: '#e65100' };
  if (phase === 'EXPIRED') return { label: 'Expirada', bg: '#f5f5f5', text: '#666' };
  if (phase === 'FINISHED') return { label: 'Finalizada', bg: '#eef2ff', text: '#4f46e5' };
  return { label: 'Confirmada', bg: '#e8f5e9', text: '#2e7d32' };
}
