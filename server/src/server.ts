import fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import jwt from '@fastify/jwt';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { authRoutes } from './routes/auth.routes.js';
import { listingsRoutes } from './routes/listings.routes.js';
import { adminRoutes } from './routes/admin.routes.js';
import { usersRoutes } from './routes/users.routes.js';
import { reviewsRoutes } from './routes/reviews.routes.js';
import { bookingsRoutes } from './routes/bookings.routes.js';
import { chatRoutes } from './routes/chat.routes.js';
import { notificationsRoutes } from './routes/notifications.routes.js';
import { offersRoutes } from './routes/offers.routes.js';
import { Server as SocketIOServer } from 'socket.io';
import { setupSocket } from './socket.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = fastify({ logger: { level: 'error' } });

// ─── PLUGINS ──────────────────────────────────────────────────────────────────

await app.register(cors, { 
  origin: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
});

await app.register(jwt, {
  secret: process.env['JWT_SECRET'] ?? 'fallback_secret_change_in_production',
});

app.register(multipart, {
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
});

app.register(fastifyStatic, {
  root: path.join(__dirname, '..', 'uploads'),
  prefix: '/uploads/',
});

// ─── ROTAS ────────────────────────────────────────────────────────────────────

app.register(authRoutes);
app.register(listingsRoutes);
app.register(adminRoutes);
app.register(usersRoutes);
app.register(reviewsRoutes);
app.register(bookingsRoutes);
app.register(chatRoutes);
app.register(notificationsRoutes);
app.register(offersRoutes);

// Rota de health check
app.get('/hello', async () => ({ message: 'API do Zhivago está online! 🚀' }));

// ─── WEBSOCKET ────────────────────────────────────────────────────────────────

const io = new SocketIOServer(app.server, {
  cors: {
    origin: '*',
  }
});
setupSocket(io);

// ─── START ────────────────────────────────────────────────────────────────────

const start = async (): Promise<void> => {
  try {
    await app.listen({ port: 3333, host: '0.0.0.0' });
    console.log('✅ HTTP Server running on http://localhost:3333');
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();