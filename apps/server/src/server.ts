import fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
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
import { organizationsRoutes } from './routes/organizations.routes.js';
import { leadsRoutes } from './routes/leads.routes.js';
import { Server as SocketIOServer } from 'socket.io';
import { setupSocket } from './socket.js';
import { JWT_SECRET, ALLOWED_ORIGINS } from './lib/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = fastify({ logger: { level: 'error' } });

// ─── PLUGINS ──────────────────────────────────────────────────────────────────

await app.register(cors, {
  // Requisições sem header Origin (app mobile, curl, chamadas server-to-server) não são
  // requisições CORS de navegador e não passam por essa checagem.
  origin: ALLOWED_ORIGINS,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
});

await app.register(jwt, {
  secret: JWT_SECRET,
});

await app.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute',
});

app.register(multipart, {
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
});

// Em produção (Cloud Run) os uploads vão para o GCS e são servidos direto pela URL pública do
// bucket — só registramos o /uploads/ estático quando não há bucket configurado (dev local).
if (!process.env['GCS_BUCKET_NAME']) {
  app.register(fastifyStatic, {
    root: path.join(__dirname, '..', 'uploads'),
    prefix: '/uploads/',
  });
}

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
app.register(organizationsRoutes);
app.register(leadsRoutes);

// Rota de health check
app.get('/hello', async () => ({ message: 'API do Zhivago está online! 🚀' }));

// ─── WEBSOCKET ────────────────────────────────────────────────────────────────

/**
 * INTEGRAÇÃO DO SOCKET.IO COM FASTIFY:
 * O Fastify encapsula o servidor Node HTTP subjacente em `app.server`. Como o Socket.io
 * precisa se acoplar a um servidor HTTP puro (TCP stream) para escutar a porta e gerenciar
 * o protocolo de upgrade de conexões WebSocket, passamos `app.server` para o construtor do
 * SocketIOServer.
 *
 * O CORS aqui só afeta o cliente web (navegador) — o app mobile não envia header Origin e não
 * é restringido por essa política.
 */
const io = new SocketIOServer(app.server, {
  cors: {
    origin: ALLOWED_ORIGINS,
  }
});

// Inicializa a escuta de eventos, middlewares de autenticação e salas no arquivo socket.ts
setupSocket(io);

// ─── START ────────────────────────────────────────────────────────────────────

const start = async (): Promise<void> => {
  try {
    const port = Number(process.env['PORT']) || 3333;
    await app.listen({ port, host: '0.0.0.0' });
    console.log(`✅ HTTP Server running on http://localhost:${port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();