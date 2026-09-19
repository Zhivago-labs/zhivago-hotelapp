import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getApiUrl } from "@/lib/api";
import type { AccountType } from "@zhivago/shared";

export const TOKEN_COOKIE = "zhivago_token";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  avatar: string | null;
  role: string;
  status: string;
  createdAt: string;
  accountType: AccountType;
  companyName: string | null;
  creci: string | null;
  verified: boolean;
}

export async function getToken(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(TOKEN_COOKIE)?.value ?? null;
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const token = await getToken();
  if (!token) return null;

  try {
    const res = await fetch(`${getApiUrl()}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

/**
 * Para páginas que exigem login. Redireciona para /login (preservando o destino)
 * quando não há sessão válida; caso contrário devolve o token para chamadas à API.
 */
export async function requireAuth(redirectTo: string): Promise<{ token: string; user: SessionUser }> {
  const token = await getToken();
  const user = token ? await getSessionUser() : null;

  if (!token || !user) {
    redirect(`/login?next=${encodeURIComponent(redirectTo)}`);
  }

  return { token, user };
}
