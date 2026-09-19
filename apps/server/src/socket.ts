import { Server as SocketIOServer } from 'socket.io';
import { prisma } from './lib/prisma.js';
import jwt from 'jsonwebtoken';
import { sendNotification } from './services/notification.service.js';
import { JWT_SECRET } from './lib/env.js';
let ioInstance: SocketIOServer | null = null;

export function setupSocket(io: SocketIOServer) {
  ioInstance = io;


  io.use(async (socket, next) => {
    const token = socket.handshake.auth['token'];
    if (!token) {
      return next(new Error('Authentication error: Token missing'));
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { id: string; role: string; tokenVersion?: number };

      // Revalida estado do usuário no banco a cada conexão WebSocket
      const dbUser = await prisma.user.findUnique({
        where: { id: decoded.id },
        select: { id: true, role: true, status: true, tokenVersion: true },
      });

      if (!dbUser || dbUser.status !== 'ACTIVE') {
        return next(new Error('Authentication error: Account suspended or not found'));
      }

      if (decoded.tokenVersion !== undefined && decoded.tokenVersion !== dbUser.tokenVersion) {
        return next(new Error('Authentication error: Session expired'));
      }

      // Usa dados atuais do banco, não do token
      socket.data.user = { id: dbUser.id, role: dbUser.role };
      next();
    } catch (error) {
      next(new Error('Authentication error: Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const user = socket.data.user;
  
    const roomName = `room_${user.id}`;
    socket.join(roomName);
    console.log(`User ${user.id} connected and joined ${roomName}`);

    // Ouvir envio de mensagens enviado pelo app (React Native)
    socket.on('sendMessage', async (data: { conversationId: string, content: string }, callback) => {
      try {
        const { conversationId, content } = data;

        // Validação de Segurança: Garante que a conversa existe e que o usuário solicitante 
        // é de fato um dos participantes (comprador ou vendedor) dela
        const conversation = await prisma.conversation.findUnique({
          where: { id: conversationId },
          include: { participants: true }
        });

        if (!conversation || !conversation.participants.some(p => p.id === user.id)) {
          if (callback) callback({ error: 'Conversation not found or access denied' });
          return;
        }

        // Se o administrador encerrou/bloqueou a conversa, impede novas mensagens
        if ((conversation as any).isClosed) {
          if (callback) callback({ error: 'Conversation is closed by admin' });
          return;
        }

        // Grava a mensagem no banco de dados com relacionamento ao remetente
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

        // Atualiza o timestamp da conversa para que ela suba no topo da caixa de entrada dos usuários
        await prisma.conversation.update({
          where: { id: conversationId },
          data: { updatedAt: new Date() }
        });

        // Identifica quem é o outro participante da conversa para notificá-lo
        const recipient = conversation.participants.find(p => p.id !== user.id);
        
        if (recipient) {
          // Emite a mensagem em tempo real para a sala exclusiva do destinatário
          io.to(`room_${recipient.id}`).emit('receiveMessage', message);

          // Dispara notificação (push vai só se o destinatário tiver algum device registrado)
          await sendNotification({
            userId: recipient.id,
            title: `Nova mensagem de ${message.sender.name}`,
            message: content,
            type: 'MESSAGE',
          });
        }

        // Retorna sucesso para o remetente (com a mensagem gerada e ID do banco) via callback de confirmação
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

/**
 * Retorna a instância ativa do Socket.io para envio de eventos a partir de rotas HTTP normais.
 */
export function getIO(): SocketIOServer {
  if (!ioInstance) {
    throw new Error('Socket.io not initialized');
  }
  return ioInstance;
}
