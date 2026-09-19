"use client";

import { useChatSocket } from "./ChatSocketProvider";
import styles from "./UnreadBadge.module.css";

export function UnreadBadge() {
  const { unreadCount } = useChatSocket();
  if (unreadCount === 0) return null;
  return <span className={styles.badge}>{unreadCount > 9 ? "9+" : unreadCount}</span>;
}
