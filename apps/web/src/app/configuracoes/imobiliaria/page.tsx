import { notFound } from "next/navigation";
import Link from "next/link";
import { requireAuth } from "@/lib/session";
import { getAgencyProfile } from "@/lib/api";
import { ShowcaseForm } from "./ShowcaseForm";
import styles from "../page.module.css";
export default async function CompanySettings() {
  const { token, user } = await requireAuth("/configuracoes/imobiliaria");
  const profile = await getAgencyProfile(user.id);
  if (!profile) notFound();
  const org = profile.organization;
  const member = org?.members.find(member => member.user.id === user.id);
  if (org ? !member || !["OWNER", "ADMIN"].includes(member.role) : user.accountType !== "AGENCY") notFound();
  return <main className={styles.main}><div className={styles.container}>
    <Link href={`/imobiliaria/${user.id}`}>Voltar à vitrine</Link>
    <h1>Configurações da imobiliária</h1>
    <p>Identidade e canais públicos da empresa. As informações pessoais são editadas nas configurações da conta.</p>
    <section className={styles.card}><ShowcaseForm token={token} initial={{
      name: org?.name || profile.user.companyName || user.name,
      logo: org ? org.logo : profile.user.logoUrl,
      coverUrl: org ? org.coverUrl : profile.user.coverUrl,
      description: org ? org.description : profile.user.publicDescription,
      publicLocation: org ? org.publicLocation : profile.user.publicLocation,
      phone: org ? org.phone : profile.user.publicPhone,
      email: org ? org.email : profile.user.publicEmail,
    }} /></section>
  </div></main>;
}
