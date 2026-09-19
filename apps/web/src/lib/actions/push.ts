"use server";

import { getToken } from "@/lib/session";
import { getPublicApiUrl } from "@/lib/public-api";

export async function savePushTokenAction(subscriptionJson: string): Promise<{ success: boolean; error?: string }> {
  try {
    const token = await getToken();
    if (!token) {
      return { success: false, error: "Usuário não autenticado." };
    }

    const res = await fetch(`${getPublicApiUrl()}/users/me/push-token`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        platform: "WEB",
        token: subscriptionJson,
      }),
    });

    if (!res.ok) {
      return { success: false, error: `Erro da API (${res.status})` };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || "Erro de conexão." };
  }
}
