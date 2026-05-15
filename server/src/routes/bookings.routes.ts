import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middlewares/authenticate.js';
import { createBooking, getBookings, approveBooking, rejectBooking, cancelBooking } from '../controllers/bookings.controller.js';

export async function bookingsRoutes(app: FastifyInstance): Promise<void> {
  app.post('/listings/:id/bookings', { preHandler: [authenticate] }, createBooking);
  app.get('/listings/:id/bookings', getBookings);
  app.patch('/bookings/:id/approve', { preHandler: [authenticate] }, approveBooking);
  app.patch('/bookings/:id/reject', { preHandler: [authenticate] }, rejectBooking);
  app.patch('/bookings/:id/cancel', { preHandler: [authenticate] }, cancelBooking);
}
