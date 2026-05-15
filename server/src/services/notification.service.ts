import { PrismaClient } from '@prisma/client';
import { getIO } from '../socket.js';
import { Expo } from 'expo-server-sdk';

const prisma = new PrismaClient();
const expo = new Expo();

export async function sendNotification(data: {
  userId: string;
  title: string;
  message: string;
  type?: string;
}) {
  try {
    // Save to database
    const notification = await prisma.notification.create({
      data: {
        userId: data.userId,
        title: data.title,
        message: data.message,
        type: data.type ?? 'INFO',
      },
    });

    // Emit via WebSocket
    try {
      const io = getIO();
      io.to(`room_${data.userId}`).emit('receiveNotification', notification);
    } catch (e) {
      console.warn('Could not emit notification via socket', e);
    }

    // Try to send Push Notification if user has push token
    const user = await prisma.user.findUnique({
      where: { id: data.userId },
      select: { pushToken: true },
    });

    if (user?.pushToken && Expo.isExpoPushToken(user.pushToken)) {
      try {
        await expo.sendPushNotificationsAsync([{
          to: user.pushToken,
          sound: 'default',
          title: data.title,
          body: data.message,
          data: { type: data.type },
        }]);
      } catch (pushError) {
        console.error('Error sending push notification:', pushError);
      }
    }

    return notification;
  } catch (error) {
    console.error('Failed to send notification:', error);
    throw error;
  }
}
