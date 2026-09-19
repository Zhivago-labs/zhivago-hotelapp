"use client";

import { MessageCircle } from "lucide-react";
import { useChatSocket } from "./ChatSocketProvider";
import { UnreadBadge } from "./UnreadBadge";
import styles from "@/components/SiteHeader.module.css";

export function MessagesNavButton() {
  const { openSidebar } = useChatSocket();

  return (
    <button
      type="button"
      className={styles.navLink}
      onClick={() => openSidebar()}
      style={{ background: "none", border: "none", cursor: "pointer", font: "inherit" }}
    >
      <MessageCircle size={16} />
      <span>Mensagens</span>
      <UnreadBadge />
    </button>
  );
}
