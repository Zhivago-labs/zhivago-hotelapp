import { redirect } from "next/navigation";

import { getWorkspaceSession } from "@/lib/workspace";
export default async function AnunciosRootPage() {
  const { membership } = await getWorkspaceSession();
  if (membership) redirect("/empresa/imoveis");
  redirect("/imoveis");
}
