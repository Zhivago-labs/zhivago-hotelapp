"use client";

import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import styles from "./ErrorState.module.css";

interface ErrorStateProps {
  title?: string;
  message: string;
}

export function ErrorState({ title = "Não foi possível carregar os imóveis", message }: ErrorStateProps) {
  const router = useRouter();

  return (
    <div className={styles.container} role="alert">
      <p className={styles.title}>{title}</p>
      <p className={styles.message}>{message}</p>
      <button type="button" className={styles.retryButton} onClick={() => router.refresh()}>
        <RefreshCw size={15} />
        Tentar novamente
      </button>
    </div>
  );
}
