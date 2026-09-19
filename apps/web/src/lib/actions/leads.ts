"use server";

import { revalidatePath } from "next/cache";
import { getApiUrl } from "@/lib/api";
import { getToken } from "@/lib/session";

function extractErrorMessage(data: unknown, fallback: string): string {
  if (data && typeof data === "object" && "error" in data) {
    const error = (data as { error: unknown }).error;
    if (typeof error === "string") return error;
    if (Array.isArray(error) && error[0]?.message) return String(error[0].message);
  }
  return fallback;
}

export type LeadFormState = { error: string } | undefined;

export async function assignLeadAction(
  _prevState: LeadFormState,
  formData: FormData
): Promise<LeadFormState> {
  const token = await getToken();
  const leadId = String(formData.get("leadId") ?? "");
  const brokerMemberId = String(formData.get("brokerMemberId") ?? "");
  if (!token || !leadId || !brokerMemberId) return { error: "Selecione um corretor válido." };

  const res = await fetch(`${getApiUrl()}/leads/${leadId}/assign`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ brokerMemberId }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    return { error: extractErrorMessage(data, "Não foi possível atribuir o lead.") };
  }

  revalidatePath("/imobiliaria");
  revalidatePath(`/imobiliaria/leads/${leadId}`);
}

export async function updateLeadStatusAction(
  _prevState: LeadFormState,
  formData: FormData
): Promise<LeadFormState> {
  const token = await getToken();
  const leadId = String(formData.get("leadId") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!token || !leadId || !status) return { error: "Status inválido." };

  const res = await fetch(`${getApiUrl()}/leads/${leadId}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    return { error: extractErrorMessage(data, "Não foi possível atualizar o status do lead.") };
  }

  revalidatePath("/imobiliaria");
  revalidatePath(`/imobiliaria/leads/${leadId}`);
}

export async function addInteractionAction(
  _prevState: LeadFormState,
  formData: FormData
): Promise<LeadFormState> {
  const token = await getToken();
  const leadId = String(formData.get("leadId") ?? "");
  const type = String(formData.get("type") ?? "");
  const content = String(formData.get("content") ?? "").trim();
  if (!token || !leadId || !type) return { error: "Preencha o tipo de contato." };

  const res = await fetch(`${getApiUrl()}/leads/${leadId}/interactions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ type, content: content || undefined }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    return { error: extractErrorMessage(data, "Não foi possível registrar a interação.") };
  }

  revalidatePath(`/imobiliaria/leads/${leadId}`);
}

export async function scheduleVisitAction(
  _prevState: LeadFormState,
  formData: FormData
): Promise<LeadFormState> {
  const token = await getToken();
  const leadId = String(formData.get("leadId") ?? "");
  const scheduledAt = String(formData.get("scheduledAt") ?? "");
  const notes = String(formData.get("notes") ?? "").trim();
  if (!token || !leadId || !scheduledAt) return { error: "Escolha data e horário da visita." };

  const res = await fetch(`${getApiUrl()}/leads/${leadId}/visits`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ scheduledAt, notes: notes || undefined }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    return { error: extractErrorMessage(data, "Não foi possível agendar a visita.") };
  }

  revalidatePath(`/imobiliaria/leads/${leadId}`);
}

export async function updateVisitStatusAction(
  _prevState: LeadFormState,
  formData: FormData
): Promise<LeadFormState> {
  const token = await getToken();
  const visitId = String(formData.get("visitId") ?? "");
  const leadId = String(formData.get("leadId") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!token || !visitId || !status) return { error: "Status inválido." };

  const res = await fetch(`${getApiUrl()}/visits/${visitId}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    return { error: extractErrorMessage(data, "Não foi possível atualizar o status da visita.") };
  }

  if (leadId) revalidatePath(`/imobiliaria/leads/${leadId}`);
}

export async function updateLeadDistributionModeAction(
  _prevState: LeadFormState,
  formData: FormData
): Promise<LeadFormState> {
  const token = await getToken();
  const mode = String(formData.get("mode") ?? "");
  if (!token || (mode !== "MANUAL" && mode !== "ROUND_ROBIN")) return { error: "Modo inválido." };

  const res = await fetch(`${getApiUrl()}/organizations/lead-distribution-mode`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ mode }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    return { error: extractErrorMessage(data, "Não foi possível atualizar o modo de distribuição.") };
  }

  revalidatePath("/equipe");
}
