"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getApiUrl } from "@/lib/api";
import { TOKEN_COOKIE } from "@/lib/session";

export type AuthFormState = { error: string } | undefined;

async function setAuthCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(TOKEN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 dias — mesma validade do JWT emitido pelo backend
  });
}

function extractErrorMessage(data: unknown, fallback: string): string {
  if (data && typeof data === "object" && "error" in data) {
    const error = (data as { error: unknown }).error;
    if (typeof error === "string") return error;
    if (Array.isArray(error) && error[0]?.message) return String(error[0].message);
  }
  return fallback;
}

/** Só aceita caminhos internos (evita open redirect via ?next=). */
function safeRedirectTarget(value: FormDataEntryValue | null, fallback: string): string {
  const target = String(value ?? "");
  return target.startsWith("/") && !target.startsWith("//") ? target : fallback;
}

export async function loginAction(
  _prevState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Preencha e-mail e senha." };
  }

  let token: string;
  // Sem "next" explícito, contas de imobiliária caem no dashboard (back-office) e o
  // resto vai pro marketplace — mesma regra usada em toda a app pra essas contas.
  let isAgencyAccount = false;
  try {
    const res = await fetch(`${getApiUrl()}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      return { error: extractErrorMessage(data, "E-mail ou senha inválidos.") };
    }
    token = data.token;
    isAgencyAccount = data.user?.accountType === "AGENCY" && data.user?.role !== "ADMIN";
  } catch {
    return { error: "Não foi possível conectar ao servidor. Tente novamente." };
  }

  await setAuthCookie(token);
  redirect(safeRedirectTarget(formData.get("next"), isAgencyAccount ? "/dashboard" : "/imoveis"));
}

export async function registerAction(
  _prevState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");
  const accountType = formData.get("accountType") === "AGENCY" ? "AGENCY" : "INDIVIDUAL";
  const companyName = String(formData.get("companyName") ?? "").trim();
  const document = String(formData.get("document") ?? "").trim();
  const creci = String(formData.get("creci") ?? "").trim();

  if (!name || !email || !password || !confirmPassword) {
    return { error: "Preencha todos os campos." };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Digite um e-mail válido (ex: nome@email.com)." };
  }
  if (password.length < 6) {
    return { error: "A senha deve ter no mínimo 6 caracteres." };
  }
  if (password !== confirmPassword) {
    return { error: "A confirmação de senha não confere." };
  }
  if (accountType === "AGENCY" && (!companyName || !document)) {
    return { error: "Preencha o nome fantasia e o CNPJ (ou CPF) da imobiliária." };
  }

  let token: string;
  try {
    const res = await fetch(`${getApiUrl()}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        email,
        password,
        accountType,
        ...(accountType === "AGENCY" ? { companyName, document, creci: creci || undefined } : {}),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      return { error: extractErrorMessage(data, "Erro ao cadastrar.") };
    }
    token = data.token;
  } catch {
    return { error: "Não foi possível conectar ao servidor. Tente novamente." };
  }

  await setAuthCookie(token);
  redirect(safeRedirectTarget(formData.get("next"), accountType === "AGENCY" ? "/dashboard" : "/imoveis"));
}

export async function logoutAction(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(TOKEN_COOKIE);
  redirect("/");
}
