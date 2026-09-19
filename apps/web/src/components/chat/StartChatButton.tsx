"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { useChatSocket } from "./ChatSocketProvider";
import { getPublicApiUrl } from "@/lib/public-api";
import styles from "./StartChatButton.module.css";

export function StartChatButton({ listingId }: { listingId: string }) {
  const router = useRouter();
  const { token, openSidebar } = useChatSocket();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    if (!token) {
      router.push(`/login?next=/imovel/${listingId}`);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${getPublicApiUrl()}/conversations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ listingId }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setError(data?.message ?? "Não foi possível iniciar a conversa.");
        return;
      }

      if (data?.id) {
        openSidebar(data.id);
      }
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.form}>
      <button
        type="button"
        onClick={handleClick}
        className={styles.button}
        disabled={loading}
      >
        <MessageCircle size={18} />
        {loading ? "Abrindo…" : "Chat"}
      </button>
      {error && <p className={styles.error}>{error}</p>}
    </div>
  );
}
