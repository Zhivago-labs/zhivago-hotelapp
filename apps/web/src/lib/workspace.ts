import { cache } from "react";
import { redirect } from "next/navigation";
import { getToken, getSessionUser, requireAuth } from "./session";
import { getMyOrganization } from "./organizations-api";
import { getApiUrl } from "./api";

/**
 * Sessão + vínculo com imobiliária, SEM forçar login. O layout do grupo (workspace) envolve rotas
 * que tratam visitante de jeitos diferentes (convite de equipe, /anuncios, /inbox…): cada página
 * faz o próprio requireAuth com o destino certo. Forçar login aqui mandava todo mundo para
 * /login?next=/empresa e perdia o destino (inclusive o token do convite).
 */
export const getWorkspaceSession = cache(async () => {
  const token = await getToken();
  const user = token ? await getSessionUser() : null;
  if (!token || !user) return { token: null, user: null, membership: null };
  const membership = await getMyOrganization(token);
  return { token, user, membership };
});

/** Páginas /empresa/*: exigem login e vínculo ativo; sem vínculo, vão para a tela de equipe/ingresso. */
export async function requireWorkspace(path = "/empresa") {
  const { token, user } = await requireAuth(path);
  const { membership } = await getWorkspaceSession();
  if (!membership) redirect("/equipe");
  return { token, user, membership };
}

export async function workspaceFetch<T>(token: string, path: string): Promise<T> {
  const response = await fetch(`${getApiUrl()}${path}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  if (!response.ok) throw new Error(`Não foi possível carregar os dados (${response.status}).`);
  return response.json();
}
