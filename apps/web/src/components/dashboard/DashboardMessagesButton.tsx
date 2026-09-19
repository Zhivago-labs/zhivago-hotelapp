"use client";

import { MessageSquare } from "lucide-react";
import { useChatSocket } from "@/components/chat/ChatSocketProvider";

export function DashboardMessagesButton({ className }: { className?: string }) {
  const { openSidebar } = useChatSocket();

  return (
    <button
      type="button"
      onClick={() => openSidebar()}
      className={className}
      style={{ background: "none", border: "none", cursor: "pointer", font: "inherit", textAlign: "left" }}
    >
      <MessageSquare size={15} />
      <span>Mensagens</span>
    </button>
  );
}
