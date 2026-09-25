"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { useChatSocket } from "./ChatSocketProvider";
import styles from "./FloatingChatButton.module.css";

const HIDDEN_ROUTES = ["/", "/login", "/cadastro", "/esqueci-senha", "/redefinir-senha"];

export function FloatingChatButton() {
  const pathname = usePathname();
  const { openSidebar, unreadCount, isSidebarOpen } = useChatSocket();
  const [photoViewerOpen, setPhotoViewerOpen] = useState(false);

  useEffect(() => {
    const handleViewerState = (e: Event) => {
      const customEvent = e as CustomEvent<{ open: boolean }>;
      setPhotoViewerOpen(Boolean(customEvent.detail?.open));
    };

    window.addEventListener("zhivago:photo-viewer", handleViewerState);
    return () => {
      window.removeEventListener("zhivago:photo-viewer", handleViewerState);
    };
  }, []);

  // Oculta se estiver nas telas de auth, se o chat já estiver aberto ou se o visualizador de fotos estiver ativo
  if (HIDDEN_ROUTES.includes(pathname) || isSidebarOpen || photoViewerOpen) {
    return null;
  }

  return (
    <button
      type="button"
      className={styles.fabButton}
      onClick={() => openSidebar()}
      title="Abrir mensagens (Chat Zhivago)"
      aria-label="Abrir Mensagens"
    >
      <div className={styles.iconWrap}>
        <MessageCircle size={20} />
        {unreadCount > 0 && (
          <span className={styles.badge} aria-label={`${unreadCount} mensagens não lidas`}>
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </div>
      <span className={styles.label}>Mensagens</span>
    </button>
  );
}
