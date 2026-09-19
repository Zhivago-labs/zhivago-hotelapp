"use client";

import { usePathname } from "next/navigation";

// "/" tem seu próprio nav (LandingNav) — mostrar o SiteHeader do app por cima duplicaria a navegação.
const HIDDEN_ROUTES = ["/", "/login", "/cadastro", "/esqueci-senha", "/redefinir-senha"];

export function ConditionalHeader({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (HIDDEN_ROUTES.includes(pathname)) return null;
  return <>{children}</>;
}
