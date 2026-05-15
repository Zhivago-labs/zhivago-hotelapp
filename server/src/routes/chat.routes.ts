import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middlewares/authenticate.js';
import {
  getConversations,
  getConversation,
  getMessages,
  createOrGetConversation,
  markAsRead,
  reportConversation,
  closeConversation,
  reopenConversation
} from '../controllers/chat.controller.js';

export async function chatRoutes(app: FastifyInstance) {
  app.get('/conversations', { preHandler: [authenticate] }, getConversations);
  app.get('/conversations/:id', { preHandler: [authenticate] }, getConversation);
  app.post('/conversations', { preHandler: [authenticate] }, createOrGetConversation);
  app.get('/conversations/:id/messages', { preHandler: [authenticate] }, getMessages);
  app.patch('/conversations/:id/read', { preHandler: [authenticate] }, markAsRead);
  app.patch('/conversations/:id/report', { preHandler: [authenticate] }, reportConversation);
  app.patch('/conversations/:id/close', { preHandler: [authenticate] }, closeConversation);
  app.patch('/conversations/:id/reopen', { preHandler: [authenticate] }, reopenConversation);
}
