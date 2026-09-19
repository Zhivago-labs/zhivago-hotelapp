"use client";

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { savePushTokenAction } from "@/lib/actions/push";
import styles from "./PushNotificationOptIn.module.css";

type Status = "unsupported" | "default" | "denied" | "subscribing" | "subscribed" | "error";

interface PushNotificationOptInProps {
  token?: string;
  variant?: "banner" | "menuItem";
}

const DEFAULT_VAPID_PUBLIC_KEY =
  "BOnjCB6jiTOEg8LMD8CxPH_JMfnEMpDJvlj4HUC0ACfkkYQOQwHmZ_q9KZgHQUWXRHD_S6rKnnDZrUpQS9i_NUg";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

/** Registra o Service Worker e assina Web Push (VAPID) neste navegador. */
export function PushNotificationOptIn({ variant = "menuItem" }: PushNotificationOptInProps) {
  const [status, setStatus] = useState<Status>("default");

  useEffect(() => {
    queueMicrotask(() => {
      if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
        setStatus("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        setStatus("denied");
        return;
      }
      if (Notification.permission === "granted") {
        void subscribe(true);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function subscribe(silent: boolean) {
    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || DEFAULT_VAPID_PUBLIC_KEY;
    if (!vapidPublicKey) {
      setStatus("error");
      return;
    }

    setStatus("subscribing");
    try {
      if (!silent) {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setStatus(permission === "denied" ? "denied" : "default");
          return;
        }
      }

      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
        });
      }

      const res = await savePushTokenAction(JSON.stringify(subscription));
      setStatus(res.success ? "subscribed" : "error");
    } catch {
      setStatus(silent ? "default" : "error");
    }
  }

  if (status === "unsupported") return null;

  const isSubscribed = status === "subscribed";

  if (variant === "menuItem") {
    return (
      <button
        type="button"
        onClick={() => {
          if (status !== "subscribing" && status !== "denied") {
            subscribe(false);
          }
        }}
        className={styles.menuItemButton}
        disabled={status === "subscribing" || status === "denied"}
        aria-label={isSubscribed ? "Notificações ativadas" : "Ativar notificações"}
        title={status === "denied" ? "Notificações bloqueadas pelo navegador" : undefined}
      >
        <div className={styles.menuItemLeft}>
          <Bell size={16} className={isSubscribed ? styles.bellActiveIcon : ""} />
          <span>
            {status === "subscribing"
              ? "Ativando…"
              : status === "denied"
              ? "Notificações Bloqueadas"
              : isSubscribed
              ? "Notificações"
              : "Ativar Notificações"}
          </span>
        </div>
        <span className={`${styles.switchBadge} ${isSubscribed ? styles.switchBadgeActive : ""}`}>
          <span className={styles.switchDot} />
        </span>
      </button>
    );
  }

  return (
    <div className={styles.wrap}>
      {status === "denied" && (
        <p className={styles.hint}>
          Notificações bloqueadas pelo navegador. Ative nas permissões do site pra receber avisos de mensagens e
          reservas.
        </p>
      )}
      {status === "subscribed" && <p className={styles.hint}>🔔 Notificações ativadas neste navegador.</p>}
      {(status === "default" || status === "subscribing" || status === "error") && (
        <button
          type="button"
          className={styles.button}
          onClick={() => subscribe(false)}
          disabled={status === "subscribing"}
        >
          {status === "subscribing" ? "Ativando…" : "🔔 Ativar notificações"}
        </button>
      )}
      {status === "error" && <p className={styles.error}>Não foi possível ativar. Tente novamente.</p>}
    </div>
  );
}
