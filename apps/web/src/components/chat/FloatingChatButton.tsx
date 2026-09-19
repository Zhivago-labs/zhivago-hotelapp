"use client";

import { usePathname } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { useChatSocket } from "./ChatSocketProvider";
import styles from "./FloatingChatButton.module.css";

const HIDDEN_ROUTES = ["/", "/login", "/cadastro", "/esqueci-senha", "/redefinir-senha"];

export function FloatingChatButton() {
  const pathname = usePathname();
  const { openSidebar, unreadCount, isSidebarOpen } = useChatSocket();

  // Oculta se estiver nas telas de auth ou se o chat já estiver aberto
  if (HIDDEN_ROUTES.includes(pathname) || isSidebarOpen) {
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
