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

  useEffect(() => {
    if (user && token) {
      refreshUnreadCount();

      const newSocket = io(API_URL, {
        auth: { token }
      });

      newSocket.on('receiveMessage', () => {
        refreshUnreadCount();
      });

      setSocket(newSocket);

      return () => {
        newSocket.disconnect();
      };
    } else {
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
