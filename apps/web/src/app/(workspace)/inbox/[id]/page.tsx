import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";

type Params = { params: Promise<{ id: string }> };

export default async function ConversationPage({ params }: Params) {
  const { id } = await params;
  const user = await getSessionUser();
  // Mesmo motivo do /inbox: precisa cair numa página que não redirecione de novo por cima,
  // senão o parâmetro ?openChat some no meio do caminho pra contas de imobiliária.
  const isAgencyAccount = user?.accountType === "AGENCY" && user.role !== "ADMIN";
  redirect(isAgencyAccount ? `/dashboard?openChat=${id}` : `/imoveis?openChat=${id}`);
}
