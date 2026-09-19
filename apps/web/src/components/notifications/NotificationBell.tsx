"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { useChatSocket, type AppNotification } from "@/components/chat/ChatSocketProvider";
import styles from "./NotificationBell.module.css";

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "agora";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `há ${days}d`;
  return new Date(iso).toLocaleDateString("pt-BR");
}

function NotificationItem({
  notification,
  onRead,
}: {
  notification: AppNotification;
  onRead: (id: string) => void;
}) {
  return (
    <button
      type="button"
      className={`${styles.item} ${!notification.isRead ? styles.itemUnread : ""}`}
      onClick={() => !notification.isRead && onRead(notification.id)}
    >
      {notification.isRead ? <span className={styles.dotPlaceholder} /> : <span className={styles.dot} />}
      <div className={styles.itemBody}>
        <p className={styles.itemTitle}>{notification.title}</p>
        <p className={styles.itemMessage}>{notification.message}</p>
        <p className={styles.itemTime}>{timeAgo(notification.createdAt)}</p>
      </div>
    </button>
  );
}

export function NotificationBell() {
  const { notifications, unreadNotificationCount, markNotificationRead, markAllNotificationsRead } =
    useChatSocket();
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className={styles.wrapper} ref={wrapperRef}>
      <button
        type="button"
        className={`${styles.trigger} ${isOpen ? styles.triggerActive : ""}`}
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="true"
        aria-expanded={isOpen}
        aria-label="Notificações"
      >
        <Bell size={18} />
        {unreadNotificationCount > 0 && (
          <span className={styles.badge}>{unreadNotificationCount > 9 ? "9+" : unreadNotificationCount}</span>
        )}
      </button>

      {isOpen && (
        <div className={styles.dropdown}>
          <div className={styles.dropdownHeader}>
            <span className={styles.dropdownTitle}>Notificações</span>
            <button
              type="button"
              className={styles.markAllButton}
              disabled={unreadNotificationCount === 0}
              onClick={markAllNotificationsRead}
            >
              <CheckCheck size={13} />
              Marcar todas como lidas
            </button>
          </div>

          <div className={styles.list}>
            {notifications.length === 0 ? (
              <p className={styles.empty}>Você ainda não tem notificações.</p>
            ) : (
              notifications
                .slice(0, 20)
                .map((n) => <NotificationItem key={n.id} notification={n} onRead={markNotificationRead} />)
            )}
          </div>
        </div>
      )}
    </div>
  );
}
