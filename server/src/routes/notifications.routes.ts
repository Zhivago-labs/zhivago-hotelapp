import type { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

import { authenticate } from '../middlewares/authenticate.js';

export async function notificationsRoutes(app: FastifyInstance) {
  // Get all notifications for user
  app.get('/notifications', { preHandler: [authenticate] }, async (request, reply) => {
    const user = request.user as { id: string };

    try {
      const notifications = await prisma.notification.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
      });

      return reply.send(notifications);
    } catch (error) {
      console.error('Error fetching notifications:', error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // Mark all notifications as read
  app.put('/notifications/read-all', { preHandler: [authenticate] }, async (request, reply) => {
    const user = request.user as { id: string };

    try {
      await prisma.notification.updateMany({
        where: { userId: user.id, isRead: false },
        data: { isRead: true },
      });

      return reply.send({ success: true });
    } catch (error) {
      console.error('Error marking notifications as read:', error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // Mark a specific notification as read
  app.put('/notifications/:id/read', { preHandler: [authenticate] }, async (request, reply) => {
    const user = request.user as { id: string };
    const { id } = request.params as { id: string };

    try {
      const notification = await prisma.notification.findUnique({
        where: { id }
      });

      if (!notification || notification.userId !== user.id) {
        return reply.status(404).send({ error: 'Notification not found' });
      }

      await prisma.notification.update({
        where: { id },
        data: { isRead: true },
      });

      return reply.send({ success: true });
    } catch (error) {
      console.error('Error marking notification as read:', error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });
}
