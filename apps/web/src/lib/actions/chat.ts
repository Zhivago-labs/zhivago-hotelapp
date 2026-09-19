"use server";

import { redirect } from "next/navigation";
import { getApiUrl } from "@/lib/api";
import { getToken } from "@/lib/session";

export type StartConversationState = { error: string } | undefined;

export async function startConversationAction(
  _prevState: StartConversationState,
  formData: FormData
): Promise<StartConversationState> {
  const listingId = String(formData.get("listingId") ?? "");
  if (!listingId) return { error: "Imóvel inválido." };

  const token = await getToken();
  if (!token) redirect(`/login?next=/imovel/${listingId}`);

  let conversationId: string;
  try {
    const res = await fetch(`${getApiUrl()}/conversations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ listingId }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      return { error: data?.message ?? "Não foi possível iniciar a conversa." };
    }
    conversationId = data.id;
  } catch {
    return { error: "Não foi possível conectar ao servidor. Tente novamente." };
  }

  redirect(`/inbox/${conversationId}`);
}
