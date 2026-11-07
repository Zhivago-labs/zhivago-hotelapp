import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, Building as Store, OpenNewWindow as ExternalLink } from "iconoir-react";
import { requireAuth } from "@/lib/session";
import { getMyOrganization } from "@/lib/organizations-api";
import { getAgencyProfile } from "@/lib/api";
import { canEditShowcase } from "@/lib/showcase";
import { ShowcaseForm } from "./ShowcaseForm";
import styles from "../page.module.css";

export const metadata: Metadata = { title: "Minha imobiliária — Zhivago" };

export default async function CompanySettings() {
  const { token, user } = await requireAuth("/configuracoes/imobiliaria");
  const [profile, membership] = await Promise.all([getAgencyProfile(user.id), getMyOrganization(token)]);
  const allowed = canEditShowcase(profile, user);
  const org = profile?.organization;
  const showcaseHref = `/imobiliaria/${user.id}`;

  return (
    <main className={styles.main}>
      <div className={styles.container}>
        <div className={styles.header}>
          <Link href="/configuracoes" className={styles.backLink}>
            <ArrowLeft width={18} height={18} /> Voltar às configurações
          </Link>
          <div className={styles.titleRow}>
            <h1 className={styles.title}>
              <Store width={28} height={28} className={styles.titleIcon} /> Minha imobiliária
            </h1>
            {allowed && (
              <Link href={showcaseHref} className={styles.backLink} target="_blank">
                Ver vitrine pública <ExternalLink width={15} height={15} />
              </Link>
            )}
          </div>
          <p className={styles.subtitle}>
            Capa, logo, apresentação e contato que os clientes veem na vitrine da imobiliária. Seus dados
            pessoais continuam nas configurações da conta.
          </p>
        </div>

        <section className={styles.card}>
          {!profile || !allowed ? (
            <p className={styles.subtitle}>
              {org
                ? "Só o proprietário ou um administrador da imobiliária pode editar a vitrine. Peça a um deles para fazer a alteração."
                : "A vitrine de imobiliária é para contas de imobiliária. Sua conta é de anunciante individual."}
            </p>
          ) : (
            <ShowcaseForm
              token={token}
              initial={{
                ...(membership ? { legalName: membership.organization.legalName, address: membership.organization.address, businessHours: membership.organization.businessHours, whatsapp: membership.organization.whatsapp } : {}),
                name: org?.name || profile.user.companyName || "Imobiliária",
                logo: org ? org.logo : profile.user.logoUrl,
                coverUrl: org ? org.coverUrl : profile.user.coverUrl,
                description: org ? org.description : profile.user.publicDescription,
                publicLocation: org ? org.publicLocation : profile.user.publicLocation,
                phone: org ? org.phone : profile.user.publicPhone,
                email: org ? org.email : profile.user.publicEmail,
              }}
            />
          )}
        </section>
      </div>
    </main>
  );
}
