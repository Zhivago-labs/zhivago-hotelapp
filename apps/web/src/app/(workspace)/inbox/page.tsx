import { redirect } from "next/navigation";
import { getWorkspaceSession } from "@/lib/workspace";
import { getSessionUser } from "@/lib/session";

export default async function InboxPage() {
  const { membership } = await getWorkspaceSession();
  if (membership) redirect("/empresa/mensagens?openChat=true");
  const user = await getSessionUser();
  // Chat abre via ChatSidebar/?openChat, montado no layout raiz de toda rota — precisa cair
  // numa página que não faça outro redirect por cima, senão o parâmetro se perde no caminho
  // (mesmo motivo da Etapa "/" ter passado a redirecionar contas de imobiliária pro dashboard).
  const isAgencyAccount = user?.accountType === "AGENCY" && user.role !== "ADMIN";
  redirect(isAgencyAccount ? "/dashboard?openChat=true" : "/imoveis?openChat=true");
}
