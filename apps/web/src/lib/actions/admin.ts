"use server";

import { revalidatePath } from "next/cache";
import { getApiUrl } from "@/lib/api";
import { getToken } from "@/lib/session";

export type AdminActionState = { error: string } | undefined;

function extractErrorMessage(data: unknown, fallback: string): string {
  if (data && typeof data === "object" && "error" in data) {
    const error = (data as { error: unknown }).error;
    if (typeof error === "string") return error;
    if (Array.isArray(error) && error[0]?.message) return String(error[0].message);
  }
  return fallback;
}

export async function approveListingAction(
  _prevState: AdminActionState,
  formData: FormData
): Promise<AdminActionState> {
  const token = await getToken();
  const id = String(formData.get("id") ?? "");
  if (!token || !id) return { error: "Anúncio inválido." };

  const res = await fetch(`${getApiUrl()}/admin/listings/${id}/approve`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    return { error: extractErrorMessage(data, "Não foi possível aprovar o anúncio.") };
  }

  revalidatePath("/admin");
  revalidatePath("/imoveis");
}

export async function pendingListingAction(
  _prevState: AdminActionState,
  formData: FormData
): Promise<AdminActionState> {
  const token = await getToken();
  const id = String(formData.get("id") ?? "");
  if (!token || !id) return { error: "Anúncio inválido." };

  const res = await fetch(`${getApiUrl()}/admin/listings/${id}/pending`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    return { error: extractErrorMessage(data, "Não foi possível marcar o anúncio como pendente.") };
  }

  revalidatePath("/admin");
  revalidatePath("/imoveis");
}

export async function rejectListingAction(
  _prevState: AdminActionState,
  formData: FormData
): Promise<AdminActionState> {
  const token = await getToken();
  const id = String(formData.get("id") ?? "");
  const reason = String(formData.get("reason") ?? "");
  if (!token || !id) return { error: "Anúncio inválido." };
  if (reason.length < 5) return { error: "Informe um motivo com pelo menos 5 caracteres." };

  const res = await fetch(`${getApiUrl()}/admin/listings/${id}/reject`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ reason }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    return { error: extractErrorMessage(data, "Não foi possível rejeitar o anúncio.") };
  }

  revalidatePath("/admin");
  revalidatePath("/imoveis");
}

export async function verifyAgencyAction(
  _prevState: AdminActionState,
  formData: FormData
): Promise<AdminActionState> {
  const token = await getToken();
  const id = String(formData.get("id") ?? "");
  if (!token || !id) return { error: "Conta inválida." };

  const res = await fetch(`${getApiUrl()}/admin/users/${id}/verify`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ verified: true }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    return { error: extractErrorMessage(data, "Não foi possível verificar a conta.") };
  }

  revalidatePath("/admin");
}

export async function unverifyAgencyAction(
  _prevState: AdminActionState,
  formData: FormData
): Promise<AdminActionState> {
  const token = await getToken();
  const id = String(formData.get("id") ?? "");
  if (!token || !id) return { error: "Conta inválida." };

  const res = await fetch(`${getApiUrl()}/admin/users/${id}/verify`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ verified: false }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    return { error: extractErrorMessage(data, "Não foi possível remover a verificação da conta.") };
  }

  revalidatePath("/admin");
}

export async function verifyOrganizationAction(
  _prevState: AdminActionState,
  formData: FormData
): Promise<AdminActionState> {
  const token = await getToken();
  const id = String(formData.get("id") ?? "");
  if (!token || !id) return { error: "Organização inválida." };

  const res = await fetch(`${getApiUrl()}/admin/organizations/${id}/verify`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ verified: true }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    return { error: extractErrorMessage(data, "Não foi possível verificar a organização.") };
  }

  revalidatePath("/admin");
}

export async function unverifyOrganizationAction(
  _prevState: AdminActionState,
  formData: FormData
): Promise<AdminActionState> {
  const token = await getToken();
  const id = String(formData.get("id") ?? "");
  if (!token || !id) return { error: "Organização inválida." };

  const res = await fetch(`${getApiUrl()}/admin/organizations/${id}/verify`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ verified: false }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    return { error: extractErrorMessage(data, "Não foi possível remover a verificação da empresa.") };
  }

  revalidatePath("/admin");
}

export async function adminDeleteListingAction(
  _prevState: AdminActionState,
  formData: FormData
): Promise<AdminActionState> {
  const token = await getToken();
  const id = String(formData.get("id") ?? "");
  if (!token || !id) return { error: "Anúncio inválido." };

  const res = await fetch(`${getApiUrl()}/admin/listings/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    return { error: extractErrorMessage(data, "Não foi possível remover o anúncio.") };
  }

  revalidatePath("/admin");
  revalidatePath("/imoveis");
}

export async function forceCancelBookingAction(
  _prevState: AdminActionState,
  formData: FormData
): Promise<AdminActionState> {
  const token = await getToken();
  const id = String(formData.get("id") ?? "");
  const reason = String(formData.get("reason") ?? "");
  if (!token || !id) return { error: "Reserva inválida." };
  if (reason.length < 5) return { error: "Informe um motivo com pelo menos 5 caracteres." };

  const res = await fetch(`${getApiUrl()}/admin/bookings/${id}/force-cancel`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ reason }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    return { error: extractErrorMessage(data, "Não foi possível cancelar a reserva.") };
  }

  revalidatePath("/admin");
}

export async function adminDeleteReviewAction(
  _prevState: AdminActionState,
  formData: FormData
): Promise<AdminActionState> {
  const token = await getToken();
  const id = String(formData.get("id") ?? "");
  if (!token || !id) return { error: "Avaliação inválida." };

  const res = await fetch(`${getApiUrl()}/admin/reviews/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    return { error: extractErrorMessage(data, "Não foi possível remover a avaliação.") };
  }

  revalidatePath("/admin");
}

export async function broadcastNotificationAction(
  _prevState: AdminActionState,
  formData: FormData
): Promise<AdminActionState> {
  const token = await getToken();
  const title = String(formData.get("title") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();
  const targetStatus = String(formData.get("targetStatus") ?? "ACTIVE");
  if (!token) return { error: "Sessão inválida." };
  if (!title || !message) return { error: "Preencha o título e a mensagem." };

  const res = await fetch(`${getApiUrl()}/admin/notifications/broadcast`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ title, message, targetStatus }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    return { error: extractErrorMessage(data, "Não foi possível enviar a notificação.") };
  }

  revalidatePath("/admin");
}
