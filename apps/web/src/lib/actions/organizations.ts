"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
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

export type OrgFormState = { error: string } | undefined;

export async function createOrganizationAction(
  _prevState: OrgFormState,
  formData: FormData
): Promise<OrgFormState> {
  const token = await getToken();
  if (!token) return { error: "Sessão expirada. Faça login novamente." };

  const name = String(formData.get("name") ?? "").trim();
  const document = String(formData.get("document") ?? "").trim();
  if (!name || !document) {
    return { error: "Preencha o nome da organização e o CNPJ." };
  }

  try {
    const res = await fetch(`${getApiUrl()}/organizations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name, document }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      return { error: extractErrorMessage(data, "Não foi possível criar a organização.") };
    }
  } catch {
    return { error: "Não foi possível conectar ao servidor. Tente novamente." };
  }

  revalidatePath("/equipe");
  return undefined;
}

export async function inviteMemberAction(
  _prevState: OrgFormState,
  formData: FormData
): Promise<OrgFormState> {
  const token = await getToken();
  if (!token) return { error: "Sessão expirada. Faça login novamente." };

  const email = String(formData.get("email") ?? "").trim();
  const role = String(formData.get("role") ?? "").trim();
  if (!email) return { error: "Informe o e-mail do convidado." };
  if (!["ADMIN", "MANAGER", "BROKER"].includes(role)) return { error: "Selecione uma função válida." };

  try {
    const res = await fetch(`${getApiUrl()}/organizations/invites`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ email, role }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      return { error: extractErrorMessage(data, "Não foi possível enviar o convite.") };
    }
  } catch {
    return { error: "Não foi possível conectar ao servidor. Tente novamente." };
  }

  revalidatePath("/equipe");
  return undefined;
}

export async function cancelInviteAction(
  _prevState: OrgFormState,
  formData: FormData
): Promise<OrgFormState> {
  const token = await getToken();
  if (!token) return { error: "Sessão expirada. Faça login novamente." };

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { error: "Convite inválido." };

  const res = await fetch(`${getApiUrl()}/organizations/invites/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    return { error: extractErrorMessage(data, "Não foi possível cancelar o convite.") };
  }

  revalidatePath("/equipe");
  return undefined;
}

export async function acceptInviteAction(
  _prevState: OrgFormState,
  formData: FormData
): Promise<OrgFormState> {
  const token = await getToken();
  if (!token) return { error: "Faça login para aceitar o convite." };

  const invToken = String(formData.get("token") ?? "").trim();
  if (!invToken) return { error: "Convite inválido." };

  const res = await fetch(`${getApiUrl()}/organizations/invites/${invToken}/accept`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    return { error: extractErrorMessage(data, "Não foi possível aceitar o convite.") };
  }

  revalidatePath("/equipe");
  redirect("/equipe");
}

export async function declineInviteAction(
  _prevState: OrgFormState,
  formData: FormData
): Promise<OrgFormState> {
  const token = await getToken();
  if (!token) return { error: "Faça login para recusar o convite." };

  const invToken = String(formData.get("token") ?? "").trim();
  if (!invToken) return { error: "Convite inválido." };

  const res = await fetch(`${getApiUrl()}/organizations/invites/${invToken}/decline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    return { error: extractErrorMessage(data, "Não foi possível recusar o convite.") };
  }

  revalidatePath("/equipe");
  return undefined;
}

export async function removeMemberAction(
  _prevState: OrgFormState,
  formData: FormData
): Promise<OrgFormState> {
  const token = await getToken();
  if (!token) return { error: "Sessão expirada. Faça login novamente." };

  const userId = String(formData.get("userId") ?? "").trim();
  if (!userId) return { error: "Membro inválido." };

  try {
    const res = await fetch(`${getApiUrl()}/organizations/members/${userId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      return { error: extractErrorMessage(data, "Não foi possível remover o membro.") };
    }
  } catch {
    return { error: "Não foi possível conectar ao servidor. Tente novamente." };
  }

  revalidatePath("/equipe");
  return undefined;
}

export async function updateReceiveLeadsAction(
  _prevState: OrgFormState,
  formData: FormData
): Promise<OrgFormState> {
  const token = await getToken();
  if (!token) return { error: "Sessão expirada. Faça login novamente." };

  const userId = String(formData.get("userId") ?? "").trim();
  const receiveLeads = formData.get("receiveLeads") === "true";
  if (!userId) return { error: "Membro inválido." };

  const res = await fetch(`${getApiUrl()}/organizations/members/${userId}/receive-leads`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ receiveLeads }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    return { error: extractErrorMessage(data, "Não foi possível atualizar a preferência de leads.") };
  }

  revalidatePath("/equipe");
  return undefined;
}

export async function reassignListingAgentAction(
  _prevState: OrgFormState,
  formData: FormData
): Promise<OrgFormState> {
  const token = await getToken();
  const id = String(formData.get("id") ?? "");
  const agentId = String(formData.get("agentId") ?? "");
  if (!token || !id || !agentId) return { error: "Selecione um corretor válido." };

  const res = await fetch(`${getApiUrl()}/listings/${id}/agent`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ agentId }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    return { error: extractErrorMessage(data, "Não foi possível reatribuir o corretor.") };
  }

  revalidatePath("/equipe");
}
