"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { getPublicApiUrl } from "@/lib/public-api";
import type { SessionUser } from "@/lib/session";

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  createdAt: string;
}

interface ChatSocketContextValue {
  socket: Socket | null;
  unreadCount: number;
  refreshUnreadCount: () => void;
  isSidebarOpen: boolean;
  activeConversationId: string | null;
  token: string | null;
  user: SessionUser | null;
  openSidebar: (conversationId?: string) => void;
  closeSidebar: () => void;
  selectConversation: (id: string | null) => void;
  notifications: AppNotification[];
  unreadNotificationCount: number;
  refreshNotifications: () => void;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
}

const ChatSocketContext = createContext<ChatSocketContextValue>({
  socket: null,
  unreadCount: 0,
  refreshUnreadCount: () => {},
  isSidebarOpen: false,
  activeConversationId: null,
  token: null,
  user: null,
  openSidebar: () => {},
  closeSidebar: () => {},
  selectConversation: () => {},
  notifications: [],
  unreadNotificationCount: 0,
  refreshNotifications: () => {},
  markNotificationRead: () => {},
  markAllNotificationsRead: () => {},
});

/** Único ponto de acesso ao socket compartilhado — nenhum outro componente deve chamar `io(...)`
 *  diretamente. É exatamente essa duplicação que causava o bug de conexão dupla no mobile. */
export function useChatSocket(): ChatSocketContextValue {
  return useContext(ChatSocketContext);
}

export function ChatSocketProvider({
  token,
  children,
}: {
  token: string | null;
  children: React.ReactNode;
}) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);

  const openSidebar = useCallback((conversationId?: string) => {
    if (conversationId !== undefined) {
      setActiveConversationId(conversationId);
    }
    setIsSidebarOpen(true);
  }, []);

  const closeSidebar = useCallback(() => {
    setIsSidebarOpen(false);
  }, []);

  const selectConversation = useCallback((id: string | null) => {
    setActiveConversationId(id);
  }, []);

  const refreshUnreadCount = useCallback(() => {
    if (!token) {
      setUnreadCount(0);
      return;
    }
    fetch(`${getPublicApiUrl()}/conversations`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((conversations: Array<{ _count?: { messages: number } }>) => {
        setUnreadCount(conversations.reduce((sum, c) => sum + (c._count?.messages ?? 0), 0));
      })
      .catch(() => {});
  }, [token]);

  const refreshNotifications = useCallback(() => {
    if (!token) {
      setNotifications([]);
      setUnreadNotificationCount(0);
      return;
    }
    fetch(`${getPublicApiUrl()}/notifications`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((data: AppNotification[]) => {
        setNotifications(data);
        setUnreadNotificationCount(data.filter((n) => !n.isRead).length);
      })
      .catch(() => {});
  }, [token]);

  const markNotificationRead = useCallback(
    (id: string) => {
      if (!token) return;
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
      setUnreadNotificationCount((prev) => Math.max(0, prev - 1));
      fetch(`${getPublicApiUrl()}/notifications/${id}/read`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    },
    [token]
  );

  const markAllNotificationsRead = useCallback(() => {
    if (!token) return;
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadNotificationCount(0);
    fetch(`${getPublicApiUrl()}/notifications/read-all`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {});
  }, [token]);

  useEffect(() => {
    if (!token) return;

    queueMicrotask(() => {
      refreshUnreadCount();
      refreshNotifications();
    });

    // Carrega perfil do usuário
    fetch(`${getPublicApiUrl()}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((userData) => setUser(userData))
      .catch(() => setUser(null));

    const newSocket = io(getPublicApiUrl(), { auth: { token } });
    newSocket.on("receiveMessage", () => refreshUnreadCount());
    newSocket.on("receiveNotification", (notification: AppNotification) => {
      setNotifications((prev) => [notification, ...prev]);
      setUnreadNotificationCount((prev) => prev + 1);
    });
    queueMicrotask(() => {
      setSocket(newSocket);
    });

    return () => {
      newSocket.disconnect();
      setSocket(null);
      setUser(null);
      setUnreadCount(0);
      setNotifications([]);
      setUnreadNotificationCount(0);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <ChatSocketContext.Provider
      value={{
        socket,
        unreadCount,
        refreshUnreadCount,
        isSidebarOpen,
        activeConversationId,
        token,
        user,
        openSidebar,
        closeSidebar,
        selectConversation,
        notifications,
        unreadNotificationCount,
        refreshNotifications,
        markNotificationRead,
        markAllNotificationsRead,
      }}
    >
      {children}
    </ChatSocketContext.Provider>
  );
}
