import Link from "next/link";
import { notFound } from "next/navigation";
import Image from "next/image";
import type { Metadata } from "next";
import { MapPin, MessageCircle, Pencil } from "lucide-react";
import { getAgencyProfile } from "@/lib/api";
import { getSessionUser } from "@/lib/session";
import { ShowcaseTabs } from "./ShowcaseTabs";
import { ShareButton } from "./ShareButton";
import styles from "./page.module.css";

type Params = { params: Promise<{ id: string }> };
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const profile = await getAgencyProfile((await params).id);
  return { title: profile ? profile.organization?.name || profile.user.companyName || profile.user.name : "Perfil não encontrado" };
}
export default async function AgencyPage({ params }: Params) {
  const { id } = await params;
  const profile = await getAgencyProfile(id);
  if (!profile) notFound();
  const viewer = await getSessionUser();
  const { user, organization: org } = profile;
  const business = !!org || user.accountType === "AGENCY";
  const name = org?.name || user.companyName || user.name;
  const logo = org ? org.logo : business ? user.logoUrl : user.avatar;
  const cover = org ? org.coverUrl : user.coverUrl;
  const description = org ? org.description : user.publicDescription;
  const location = org ? org.publicLocation : user.publicLocation;
  const phone = org ? org.phone : business ? user.publicPhone : user.phone;
  const email = org ? org.email : user.publicEmail;
  const digits = phone?.replace(/\D/g, "");
  const international = digits ? (digits.length <= 11 ? `55${digits}` : digits) : null;
  const contact = international ? `https://wa.me/${international}?text=${encodeURIComponent(`Olá! Vi a vitrine de ${name} no Zhivago e gostaria de informações sobre os imóveis.`)}` : email ? `mailto:${email}` : profile.listings[0] ? `/imovel/${profile.listings[0].id}#anunciante` : null;
  const viewerMember = org?.members.find(member => member.user.id === viewer?.id);
  const canEdit = org ? !!viewerMember && ["OWNER", "ADMIN"].includes(viewerMember.role) : viewer?.id === user.id && business;
  const responsible = org?.members.find(member => member.role === "OWNER")?.user ?? user;
  const since = new Date(org?.createdAt || user.createdAt).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]).join("");
  return <main className={`${styles.main} ${contact ? styles.withContact : ""}`}>
    <nav aria-label="Navegação estrutural" className={styles.breadcrumb}>
      <Link href="/">Início</Link><span aria-hidden="true">/</span><Link href="/imoveis">Imóveis</Link><span aria-hidden="true">/</span><span aria-current="page">{name}</span>
    </nav>
    <header>
      <div className={styles.cover}>
        {cover && <Image unoptimized priority src={cover} alt={`Capa de ${name}`} width={1200} height={220} className={styles.coverImage} />}
      </div>
      <div className={styles.identity}>
        <div className={styles.logo}>{logo ? <Image unoptimized src={logo} alt={`Logo de ${name}`} width={104} height={104} /> : <span aria-label={name}>{initials}</span>}</div>
        <div className={styles.company}>
          <h1>{name}</h1>
          {location && <p className={styles.location}><MapPin size={15} aria-hidden="true" />{location}</p>}
          {description && <p className={styles.summary}>{description}</p>}
          <p className={styles.since}>No Zhivago desde {since}</p>
        </div>
        <div className={styles.actions}>
          {contact ? <a className={styles.primary} href={contact} target={international ? "_blank" : undefined} rel="noopener noreferrer"><MessageCircle size={18} />Falar com {business ? "a imobiliária" : "o anunciante"}</a> : <p className={styles.since}>Contato disponível nos anúncios.</p>}
          <ShareButton title={name} />
          {canEdit && <Link className={styles.edit} href="/configuracoes/imobiliaria"><Pencil size={14} />Editar imobiliária</Link>}
        </div>
      </div>
      {business && <div className={styles.responsible}>
        {responsible.avatar && <Image unoptimized src={responsible.avatar} alt="" width={32} height={32} />}
        <span>Responsável: <strong>{responsible.name}</strong></span>
      </div>}
    </header>
    <ShowcaseTabs profile={profile} />
    {contact && <div className={styles.mobileContact}><a href={contact} target={international ? "_blank" : undefined} rel="noopener noreferrer" className={styles.primary}><MessageCircle size={18} />Falar com {business ? "a imobiliária" : "o anunciante"}</a></div>}
  </main>;
}
