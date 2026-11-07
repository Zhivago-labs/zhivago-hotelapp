import Link from "next/link";
import { requireWorkspace, workspaceFetch } from "@/lib/workspace";
import type { WorkspaceMessage } from "@/lib/workspace-types";
import styles from "@/components/workspace/Workspace.module.css";
export const metadata = { title: "Mensagens da imobiliária" };
export default async function Messages() {
  const { token } = await requireWorkspace("/empresa/mensagens");
  const items = await workspaceFetch<WorkspaceMessage[]>(token, "/organizations/messages");
  return <main className={styles.page}><h1>Mensagens</h1><p className={styles.muted}>Conversas corporativas das quais você participa, vinculadas às oportunidades autorizadas. As mensagens abrem no chat existente.</p><p className={styles.filters}><Link href="/empresa/mensagens?openChat=true" className={styles.secondary}>Abrir central de mensagens</Link></p><p className={styles.muted}>Até 100 conversas recentes. O histórico completo está disponível na central.</p><section className={styles.panel}>{items.length ? <ul className={styles.list}>{items.map(item => <li key={item.id}><Link href={`/empresa/mensagens?openChat=${item.id}`}>{item.lead?.user.name || "Atendimento"} · {item.property.name}</Link><p>{item.messages[0]?.content || "Conversa iniciada"}</p><span className={styles.muted}>{item.isClosed ? "Encerrada" : "Em atendimento"}</span></li>)}</ul> : <p className={styles.empty}>Você ainda não participa de conversas corporativas.</p>}</section></main>;
}
