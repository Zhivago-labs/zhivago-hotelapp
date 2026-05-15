import { Server as SocketIOServer } from 'socket.io';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { sendNotification } from './services/notification.service.js';

const prisma = new PrismaClient();

let ioInstance: SocketIOServer | null = null;

export function setupSocket(io: SocketIOServer) {
  ioInstance = io;
  // Middleware de autenticação do Socket.io
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Authentication error: Token missing'));
    }

    try {
      const secret = process.env['JWT_SECRET'] ?? 'fallback_secret_change_in_production';
      const decoded = jwt.verify(token, secret) as { id: string, role: string };
      socket.data.user = decoded;
      next();
    } catch (error) {
      next(new Error('Authentication error: Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const user = socket.data.user;
    const roomName = `room_${user.id}`;
    
    // Entrar na sala pessoal para receber mensagens direcionadas
    socket.join(roomName);
    console.log(`User ${user.id} connected and joined ${roomName}`);

    // Ouvir envio de mensagens
    socket.on('sendMessage', async (data: { conversationId: string, content: string }, callback) => {
      try {
        const { conversationId, content } = data;

        // Verificar se a conversa existe e se o usuário faz parte
        const conversation = await prisma.conversation.findUnique({
          where: { id: conversationId },
          include: { participants: true }
        });

        if (!conversation || !conversation.participants.some(p => p.id === user.id)) {
          if (callback) callback({ error: 'Conversation not found or access denied' });
          return;
        }

        if ((conversation as any).isClosed) {
          if (callback) callback({ error: 'Conversation is closed by admin' });
          return;
        }

        // Salvar a mensagem no banco
        const message = await prisma.message.create({
          data: {
            content,
            senderId: user.id,
            conversationId
          },
          include: {
            sender: {
              select: { id: true, name: true, avatar: true }
            }
          }
        });

        // Atualizar o updatedAt da conversa
        await prisma.conversation.update({
          where: { id: conversationId },
          data: { updatedAt: new Date() }
        });

        // Encontrar o outro participante
        const recipient = conversation.participants.find(p => p.id !== user.id);
        
        if (recipient) {
          // Emitir a mensagem para a sala do destinatário
          io.to(`room_${recipient.id}`).emit('receiveMessage', message);

          // Disparar a nova notificação
          if (recipient.pushToken) {
            await sendNotification({
              userId: recipient.id,
              title: `Nova mensagem de ${message.sender.name}`,
              message: content,
              type: 'MESSAGE',
            });
          }
        }

        if (callback) callback({ success: true, message });
      } catch (error) {
        console.error('Error handling sendMessage:', error);
        if (callback) callback({ error: 'Internal server error' });
      }
    });

    socket.on('disconnect', () => {
      console.log(`User ${user.id} disconnected`);
    });
  });
}

export function getIO(): SocketIOServer {
  if (!ioInstance) {
    throw new Error('Socket.io not initialized');
  }
  return ioInstance;
}
