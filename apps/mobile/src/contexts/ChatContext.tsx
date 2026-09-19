import React, { createContext, useContext, useEffect, useState } from 'react';
import io, { Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';

import { API_URL } from '@/config/api';

interface ChatContextData {
  socket: Socket | null;
  unreadCount: number;
  refreshUnreadCount: () => Promise<void>;
}

const ChatContext = createContext<ChatContextData>({} as ChatContextData);

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const { user, token } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  const refreshUnreadCount = async () => {
    if (!token) return;
    try {
      const response = await fetch(`${API_URL}/conversations`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        const total = data.reduce((acc: number, conv: any) => acc + (conv._count?.messages || 0), 0);
        setUnreadCount(total);
      }
    } catch (e) { }
  };

  /**
   * ─── CICLO DE VIDA DO SOCKET GLOBAL E CONTROLE DE MENSAGENS NÃO LIDAS ─────────────
   * Este useEffect gerencia o socket persistente em nível global no app.
   * Ele sincroniza a conexão do WebSocket com o estado de autenticação do usuário.
   */
  useEffect(() => {
    if (user && token) {
      // Ao logar, carrega o contador inicial de mensagens não lidas de todas as conversas
      refreshUnreadCount();

      // Inicializa a conexão Socket.io-client passando a URL resolvida da API e o JWT
      const newSocket = io(API_URL, {
        auth: { token }
      });

      // Escuta eventos de recebimento de mensagens novas globais.
      // Se uma nova mensagem chegar em qualquer conversa (mesmo que o usuário esteja 
      // navegando em outra tela do app), atualiza o contador de mensagens não lidas da Inbox.
      newSocket.on('receiveMessage', () => {
        refreshUnreadCount();
      });

      setSocket(newSocket);

      /**
       * FUNÇÃO DE RETORNO (CLEANUP):
       * Se o usuário deslogar, ou se o token mudar, a função de cleanup do React é executada.
       * Desconectamos explicitamente o socket anterior para evitar vazamento de memória e 
       * conexões "fantasmas" se acumulando no servidor Node.js.
       */
      return () => {
        newSocket.disconnect();
      };
    } else {
      // Se não há usuário autenticado, zera o contador de mensagens pendentes
      setUnreadCount(0);
    }
  }, [user, token]);

  return (
    <ChatContext.Provider value={{ socket, unreadCount, refreshUnreadCount }}>
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  return useContext(ChatContext);
}
