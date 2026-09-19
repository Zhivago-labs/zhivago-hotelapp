"use client";

import { useState } from "react";
import { Share2, Check } from "lucide-react";
import styles from "./page.module.css";

interface ShareButtonProps {
  title: string;
}

export function ShareButton({ title }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: `${title} · Zhivago`,
          text: `Confira os imóveis anunciados por ${title} no Zhivago!`,
          url,
        });
        return;
      } catch {
        // Fallback para cópia em caso de cancelamento ou falha
      }
    }

    if (typeof navigator !== "undefined" && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2400);
      } catch {
        // Sem suporte
      }
    }
  };

  return (
    <button
      type="button"
      onClick={handleShare}
      className={`${styles.actionButton} ${styles.shareButton}`}
      title="Compartilhar vitrine"
      aria-label="Compartilhar vitrine"
    >
      {copied ? <Check size={15} className={styles.checkIcon} /> : <Share2 size={15} />}
      <span>{copied ? "Link copiado!" : "Compartilhar"}</span>
    </button>
  );
}
