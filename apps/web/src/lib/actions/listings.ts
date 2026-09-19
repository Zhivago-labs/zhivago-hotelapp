"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getApiUrl } from "@/lib/api";
import { getToken } from "@/lib/session";

export type ListingFormState = { error: string } | undefined;

function extractErrorMessage(data: unknown, fallback: string): string {
  if (data && typeof data === "object" && "error" in data) {
    const error = (data as { error: unknown }).error;
    if (typeof error === "string") return error;
    if (Array.isArray(error) && error[0]?.message) return String(error[0].message);
  }
  return fallback;
}

export async function createListingAction(
  _prevState: ListingFormState,
  formData: FormData
): Promise<ListingFormState> {
  const token = await getToken();
  if (!token) redirect("/login?next=/anuncios/novo");

  const name = String(formData.get("name") ?? "").trim();
  const price = String(formData.get("price") ?? "");
  const images = formData.getAll("images").filter((file): file is File => file instanceof File && file.size > 0);
  const category = String(formData.get("category") ?? "aluguel");
  // O backend só aceita "DRAFT" ou "PENDING" — todo anúncio novo entra em moderação
  // e só fica público quando um admin aprova (nunca "APPROVED" direto na criação).
  const status = formData.get("intent") === "draft" ? "DRAFT" : "PENDING";

  // Não existe campo de endereço estruturado no backend (só `location: string`) — compõe rua,
  // número e bairro (preenchidos via ViaCEP ou à mão) junto de cidade+UF num único texto.
  const logradouro = String(formData.get("logradouro") ?? "").trim();
  const numero = String(formData.get("numero") ?? "").trim();
  const bairro = String(formData.get("bairro") ?? "").trim();
  const cidade = String(formData.get("cidade") ?? "").trim();
  const uf = String(formData.get("uf") ?? "").trim();
  const streetLine = [logradouro, numero].filter(Boolean).join(", ");
  const location = cidade && uf ? [streetLine, bairro, `${cidade}, ${uf}`].filter(Boolean).join(" - ") : "";

  // Rascunho existe pra guardar progresso incompleto — só a publicação (status PENDING, que vai
  // pra moderação) exige o anúncio completo. O backend em si só barra a falta de imagens.
  if (status === "PENDING") {
    if (!name || !price) {
      return { error: "Preencha título e preço para publicar." };
    }
    if (!location) {
      return { error: "Preencha o CEP e confirme cidade e UF do imóvel para publicar." };
    }
  }
  if (images.length === 0) {
    return { error: "Selecione ao menos uma imagem para o anúncio." };
  }

  const payload = new FormData();
  payload.set("name", name);
  const description = String(formData.get("description") ?? "").trim();
  if (description) payload.set("description", description);
  payload.set("price", price);
  payload.set("type", String(formData.get("type") ?? "casa"));
  payload.set("category", category);
  if (category === "aluguel") {
    payload.set("billingCycle", String(formData.get("billingCycle") ?? "noite"));
  }
  payload.set("location", location);
  payload.set("bedrooms", String(formData.get("bedrooms") ?? "0"));
  payload.set("bathrooms", String(formData.get("bathrooms") ?? "0"));
  payload.set("parking", String(formData.get("parking") ?? "0"));
  const amenitiesStr = String(formData.get("amenities") ?? "");
  if (amenitiesStr) payload.set("amenities", amenitiesStr);

  const checkInTime = String(formData.get("checkInTime") ?? "15:00");
  const checkOutTime = String(formData.get("checkOutTime") ?? "11:00");
  const customMaxGuests = String(formData.get("customMaxGuests") ?? "");
  const houseRules = String(formData.get("houseRules") ?? "");
  const safetyItems = String(formData.get("safetyItems") ?? "");
  const cancellationPolicy = String(formData.get("cancellationPolicy") ?? "FLEXIBLE");

  payload.set("checkInTime", checkInTime);
  payload.set("checkOutTime", checkOutTime);
  if (customMaxGuests) payload.set("customMaxGuests", customMaxGuests);
  if (houseRules) payload.set("houseRules", houseRules);
  if (safetyItems) payload.set("safetyItems", safetyItems);
  payload.set("cancellationPolicy", cancellationPolicy);

  payload.set("status", status);
  for (const image of images) {
    payload.append("images", image);
  }

  try {
    const res = await fetch(`${getApiUrl()}/listings`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: payload,
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      return { error: extractErrorMessage(data, "Não foi possível publicar o anúncio.") };
    }
  } catch {
    return { error: "Não foi possível conectar ao servidor. Tente novamente." };
  }

  revalidatePath("/dashboard");
  redirect("/dashboard");
}

export async function updateListingAction(
  _prevState: ListingFormState,
  formData: FormData
): Promise<ListingFormState> {
  const token = await getToken();
  const id = String(formData.get("id") ?? "");
  if (!token) redirect(`/login?next=/anuncios/${id}/editar`);
  if (!id) return { error: "Anúncio inválido." };

  const name = String(formData.get("name") ?? "").trim();
  const price = String(formData.get("price") ?? "");
  const location = String(formData.get("location") ?? "").trim();
  const category = String(formData.get("category") ?? "aluguel");

  if (!name || !price || !location) {
    return { error: "Preencha título, preço e localização." };
  }

  // O backend usa z.string().optional() (não .nullable()) — enviar `null` falha a validação.
  // Uma string vazia é aceita (e limpa o campo); um campo não aplicável (ex.: billingCycle
  // em venda) deve ser omitido, nunca `null`.
  const body: Record<string, unknown> = {
    name,
    description: String(formData.get("description") ?? "").trim(),
    price: Number(price),
    type: String(formData.get("type") ?? "casa"),
    category,
    location,
    bedrooms: Number(formData.get("bedrooms") ?? 0),
    bathrooms: Number(formData.get("bathrooms") ?? 0),
    parking: Number(formData.get("parking") ?? 0),
    amenities: String(formData.get("amenities") ?? ""),
  };
  if (category === "aluguel") body.billingCycle = String(formData.get("billingCycle") ?? "noite");

  try {
    const res = await fetch(`${getApiUrl()}/listings/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      return { error: extractErrorMessage(data, "Não foi possível salvar as alterações.") };
    }
  } catch {
    return { error: "Não foi possível conectar ao servidor. Tente novamente." };
  }

  revalidatePath("/dashboard");
  redirect("/dashboard");
}

export async function publishListingAction(
  _prevState: ListingFormState,
  formData: FormData
): Promise<ListingFormState> {
  const token = await getToken();
  const id = String(formData.get("id") ?? "");
  if (!token || !id) return { error: "Anúncio inválido." };

  // O endpoint de atualização só aceita "DRAFT" ou "PENDING" (mesma regra da criação) —
  // publicar um rascunho envia o anúncio para moderação, não o aprova diretamente.
  const res = await fetch(`${getApiUrl()}/listings/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ status: "PENDING" }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    return { error: extractErrorMessage(data, "Não foi possível publicar o anúncio.") };
  }

  revalidatePath("/dashboard");
}

export async function unpublishListingAction(
  _prevState: ListingFormState,
  formData: FormData
): Promise<ListingFormState> {
  const token = await getToken();
  const id = String(formData.get("id") ?? "");
  if (!token || !id) return { error: "Anúncio inválido." };

  const res = await fetch(`${getApiUrl()}/listings/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ status: "DRAFT" }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    return { error: extractErrorMessage(data, "Não foi possível despublicar o anúncio.") };
  }

  revalidatePath("/dashboard");
}

export async function duplicateListingAction(
  _prevState: ListingFormState,
  formData: FormData
): Promise<ListingFormState> {
  const token = await getToken();
  const id = String(formData.get("id") ?? "");
  if (!token || !id) return { error: "Anúncio inválido." };

  const res = await fetch(`${getApiUrl()}/listings/${id}/duplicate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    return { error: extractErrorMessage(data, "Não foi possível duplicar o anúncio.") };
  }

  const duplicate = await res.json();
  revalidatePath("/dashboard");
  redirect(`/anuncios/${duplicate.id}/editar`);
}

export async function deleteListingAction(
  _prevState: ListingFormState,
  formData: FormData
): Promise<ListingFormState> {
  const token = await getToken();
  const id = String(formData.get("id") ?? "");
  if (!token || !id) return { error: "Anúncio inválido." };

  const res = await fetch(`${getApiUrl()}/listings/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    return { error: extractErrorMessage(data, "Não foi possível remover o anúncio.") };
  }

  revalidatePath("/meus-anuncios");
  revalidatePath("/dashboard");
}

export async function applyDiscountAction(
  _prevState: ListingFormState,
  formData: FormData
): Promise<ListingFormState> {
  const token = await getToken();
  const id = String(formData.get("id") ?? "");
  const intent = String(formData.get("intent") ?? "apply");
  const discountPercent = Number(formData.get("discountPercent") ?? 0);
  const customPriceStr = formData.get("customPrice");

  if (!token || !id) return { error: "Anúncio não encontrado." };

  try {
    const listingRes = await fetch(`${getApiUrl()}/listings/${id}`);
    if (!listingRes.ok) return { error: "Imóvel não encontrado." };
    const listing = await listingRes.json();

    if (intent === "remove") {
      // Restaurar valor original e remover marcação de desconto
      const restoredPrice = listing.originalPrice ?? listing.price;
      const res = await fetch(`${getApiUrl()}/listings/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ price: restoredPrice, originalPrice: null }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        return { error: extractErrorMessage(data, "Não foi possível remover o desconto.") };
      }
    } else {
      // Base de cálculo sempre do preço original (se existir)
      const basePrice = listing.originalPrice ?? listing.price;
      let newPrice = listing.price;

      if (customPriceStr && Number(customPriceStr) > 0) {
        newPrice = Number(customPriceStr);
      } else if (discountPercent > 0 && discountPercent < 100) {
        newPrice = Math.round(basePrice * (1 - discountPercent / 100));
      } else {
        return { error: "Informe uma porcentagem de desconto válida ou novo valor." };
      }

      // Se o novo preço for igual ou maior que o preço original, remove a flag de desconto
      if (newPrice >= basePrice) {
        const res = await fetch(`${getApiUrl()}/listings/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ price: newPrice, originalPrice: null }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          return { error: extractErrorMessage(data, "Não foi possível atualizar o preço.") };
        }
      } else {
        const res = await fetch(`${getApiUrl()}/listings/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ price: newPrice, originalPrice: basePrice }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          return { error: extractErrorMessage(data, "Não foi possível aplicar o desconto.") };
        }
      }
    }
  } catch {
    return { error: "Falha de conexão ao atualizar preço." };
  }

  revalidatePath("/meus-anuncios");
  revalidatePath("/dashboard");
  revalidatePath("/");
  return undefined;
}

export async function setBookingDiscountAction(
  _prevState: ListingFormState,
  formData: FormData
): Promise<ListingFormState> {
  const token = await getToken();
  const id = String(formData.get("id") ?? "");
  const intent = String(formData.get("intent") ?? "apply");
  const customPriceStr = formData.get("customPrice");

  if (!token || !id) return { error: "Reserva não encontrada." };

  const discountedPrice = intent === "remove" ? null : Number(customPriceStr);
  if (intent !== "remove" && (!discountedPrice || discountedPrice <= 0)) {
    return { error: "Informe um valor promocional válido." };
  }

  const res = await fetch(`${getApiUrl()}/bookings/${id}/discount`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ discountedPrice }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    return { error: extractErrorMessage(data, "Não foi possível atualizar o desconto da reserva.") };
  }

  revalidatePath("/dashboard");
  return undefined;
}

export async function approveOrgListingAction(
  _prevState: ListingFormState,
  formData: FormData
): Promise<ListingFormState> {
  const token = await getToken();
  const id = String(formData.get("id") ?? "");
  if (!token || !id) return { error: "Anúncio inválido." };

  const res = await fetch(`${getApiUrl()}/listings/${id}/org-approve`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    return { error: extractErrorMessage(data, "Não foi possível aprovar o anúncio.") };
  }

  revalidatePath("/dashboard");
}

export async function rejectOrgListingAction(
  _prevState: ListingFormState,
  formData: FormData
): Promise<ListingFormState> {
  const token = await getToken();
  const id = String(formData.get("id") ?? "");
  const reason = String(formData.get("reason") ?? "");
  if (!token || !id) return { error: "Anúncio inválido." };
  if (reason.length < 5) return { error: "Informe um motivo com pelo menos 5 caracteres." };

  const res = await fetch(`${getApiUrl()}/listings/${id}/org-reject`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ reason }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    return { error: extractErrorMessage(data, "Não foi possível rejeitar o anúncio.") };
  }

  revalidatePath("/dashboard");
}

export type ImportFormState =
  | { error: string }
  | { createdCount: number; errors: { row: number; messages: string[] }[] }
  | undefined;

export async function importListingsAction(
  _prevState: ImportFormState,
  formData: FormData
): Promise<ImportFormState> {
  const token = await getToken();
  if (!token) redirect("/login?next=/anuncios/importar");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Selecione um arquivo CSV." };
  }

  const payload = new FormData();
  payload.append("file", file);

  let data: unknown;
  try {
    const res = await fetch(`${getApiUrl()}/listings/import`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: payload,
    });
    data = await res.json().catch(() => null);
    if (!res.ok) {
      return { error: extractErrorMessage(data, "Não foi possível importar o arquivo.") };
    }
  } catch {
    return { error: "Não foi possível conectar ao servidor. Tente novamente." };
  }

  revalidatePath("/dashboard");

  const result = data as { createdCount?: number; errors?: { row: number; messages: string[] }[] } | null;
  return {
    createdCount: result?.createdCount ?? 0,
    errors: Array.isArray(result?.errors) ? result.errors : [],
  };
}

export async function cancelBookingAction(
  _prevState: ListingFormState,
  formData: FormData
): Promise<ListingFormState> {
  const token = await getToken();
  const id = String(formData.get("id") ?? "");
  if (!token || !id) return { error: "Reserva inválida." };

  const res = await fetch(`${getApiUrl()}/bookings/${id}/cancel`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    return { error: extractErrorMessage(data, "Não foi possível cancelar a reserva.") };
  }

  revalidatePath("/dashboard");
}

export async function approveBookingAction(
  _prevState: ListingFormState,
  formData: FormData
): Promise<ListingFormState> {
  const token = await getToken();
  const id = String(formData.get("id") ?? "");
  if (!token || !id) return { error: "Reserva inválida." };

  const res = await fetch(`${getApiUrl()}/bookings/${id}/approve`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    return { error: extractErrorMessage(data, "Não foi possível aprovar a reserva.") };
  }

  revalidatePath("/dashboard");
}

export async function rejectBookingAction(
  _prevState: ListingFormState,
  formData: FormData
): Promise<ListingFormState> {
  const token = await getToken();
  const id = String(formData.get("id") ?? "");
  if (!token || !id) return { error: "Reserva inválida." };

  const res = await fetch(`${getApiUrl()}/bookings/${id}/reject`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    return { error: extractErrorMessage(data, "Não foi possível recusar a reserva.") };
  }

  revalidatePath("/dashboard");
}

export type BookingFormState = { error: string } | undefined;

export async function createBookingAction(
  _prevState: BookingFormState,
  formData: FormData
): Promise<BookingFormState> {
  const listingId = String(formData.get("listingId") ?? "");
  if (!listingId) return { error: "Imóvel inválido." };

  const token = await getToken();
  if (!token) redirect(`/login?next=/imovel/${listingId}`);

  const startDate = String(formData.get("startDate") ?? "");
  const endDate = String(formData.get("endDate") ?? "");
  if (!startDate || !endDate) {
    return { error: "Selecione as datas de início e fim." };
  }
  if (new Date(endDate) < new Date(startDate)) {
    return { error: "A data final não pode ser antes da data inicial." };
  }

  let conversationId: string | undefined;
  try {
    const res = await fetch(`${getApiUrl()}/listings/${listingId}/bookings`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        startDate: new Date(startDate).toISOString(),
        endDate: new Date(endDate).toISOString(),
      }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      return { error: extractErrorMessage(data, "Não foi possível solicitar a reserva.") };
    }
    conversationId = data?.conversationId;
  } catch {
    return { error: "Não foi possível conectar ao servidor. Tente novamente." };
  }

  if (conversationId) redirect(`/inbox/${conversationId}`);
  redirect(`/imovel/${listingId}`);
}
