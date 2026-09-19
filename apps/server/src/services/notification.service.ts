import { prisma } from '../lib/prisma.js';
import { getIO } from '../socket.js';
import { Expo } from 'expo-server-sdk';
import webpush from 'web-push';
import { VAPID_KEYS, VAPID_SUBJECT } from '../lib/env.js';
const expo = new Expo();

if (VAPID_KEYS) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_KEYS.publicKey, VAPID_KEYS.privateKey);
}

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

    // Envia push pra cada device registrado do usuário (um por plataforma, ver UserDevice)
    const devices = await prisma.userDevice.findMany({ where: { userId: data.userId } });

    const expoMessages = devices
      .filter((device) => (device.platform === 'IOS' || device.platform === 'ANDROID') && Expo.isExpoPushToken(device.token))
      .map((device) => ({
        to: device.token,
        sound: 'default' as const,
        title: data.title,
        body: data.message,
        data: { type: data.type },
      }));

    if (expoMessages.length > 0) {
      try {
        await expo.sendPushNotificationsAsync(expoMessages);
      } catch (pushError) {
        console.error('Error sending Expo push notification:', pushError);
      }
    }

    if (VAPID_KEYS) {
      const webDevices = devices.filter((device) => device.platform === 'WEB');
      for (const device of webDevices) {
        try {
          const subscription = JSON.parse(device.token);
          await webpush.sendNotification(
            subscription,
            JSON.stringify({ title: data.title, body: data.message, type: data.type })
          );
        } catch (pushError) {
          const statusCode = (pushError as { statusCode?: number }).statusCode;
          if (statusCode === 404 || statusCode === 410) {
            // Inscrição expirada ou revogada pelo navegador — remove pra não tentar de novo.
            await prisma.userDevice.delete({ where: { id: device.id } }).catch(() => {});
          } else {
            console.error('Error sending Web Push notification:', pushError);
          }
        }
      }
    }

    return notification;
  } catch (error) {
    console.error('Failed to send notification:', error);
    throw error;
  }
}
