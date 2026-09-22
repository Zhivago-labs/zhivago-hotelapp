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

// ─── EMPREENDIMENTOS (seção 8/63 da spec de cadastro) ────────────────────────────────────────

export type CreateBuildingState =
  | { error: string }
  | { building: { id: string; name: string; address: string | null } }
  | undefined;

/**
 * Usada pelo mini-formulário "+ Novo empreendimento" dentro do wizard de cadastro (seção 63) —
 * ao contrário das outras actions deste arquivo, retorna o registro criado (não só erro/undefined)
 * pra o wizard poder adicioná-lo à lista local sem recarregar a página.
 */
export async function createOrganizationBuildingAction(
  _prevState: CreateBuildingState,
  formData: FormData
): Promise<CreateBuildingState> {
  const token = await getToken();
  if (!token) return { error: "Sessão expirada. Faça login novamente." };

  const name = String(formData.get("name") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  if (!name) return { error: "Informe o nome do empreendimento." };

  try {
    const res = await fetch(`${getApiUrl()}/organizations/buildings`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name, address: address || undefined }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      return { error: extractErrorMessage(data, "Não foi possível criar o empreendimento.") };
    }
    // Aditivo: revalida a lista de empreendimentos do /equipe também, caso essa mesma action seja
    // usada por lá (o wizard de cadastro atualiza sua própria lista local, sem depender disto).
    revalidatePath("/equipe");
    return { building: { id: data.id, name: data.name, address: data.address ?? null } };
  } catch {
    return { error: "Não foi possível conectar ao servidor. Tente novamente." };
  }
}

/** Renomear/editar endereço do empreendimento. */
export async function updateBuildingAction(
  _prevState: OrgFormState,
  formData: FormData
): Promise<OrgFormState> {
  const token = await getToken();
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  if (!token || !id || !name) return { error: "Informe o nome do empreendimento." };

  const res = await fetch(`${getApiUrl()}/organizations/buildings/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name, address: address || null }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    return { error: extractErrorMessage(data, "Não foi possível atualizar o empreendimento.") };
  }

  revalidatePath("/equipe");
}

/**
 * Atribuir/transferir Lead Owner ou definir o backup do empreendimento (seção 74/75/17 da spec) —
 * `field` decide qual dos dois PATCH endpoints chamar; `memberId` vazio limpa o campo (remove o
 * responsável/backup atual).
 */
export async function setBuildingRoleAction(
  _prevState: OrgFormState,
  formData: FormData
): Promise<OrgFormState> {
  const token = await getToken();
  const id = String(formData.get("id") ?? "");
  const field = String(formData.get("field") ?? "");
  const memberId = String(formData.get("memberId") ?? "").trim();
  if (!token || !id || (field !== "lead-owner" && field !== "backup")) {
    return { error: "Requisição inválida." };
  }

  const res = await fetch(`${getApiUrl()}/organizations/buildings/${id}/${field}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ memberId: memberId || null }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    return { error: extractErrorMessage(data, "Não foi possível atualizar o empreendimento.") };
  }

  revalidatePath("/equipe");
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
