"use client";

import Image from "next/image";
import { useState } from "react";
import type { AgencyProfile } from "@/lib/api";
import { ListingsExplorer } from "@/components/ListingsExplorer";
import styles from "./page.module.css";

export function ShowcaseTabs({ profile }: { profile: AgencyProfile }) {
  const [tab, setTab] = useState("imoveis");
  const org = profile.organization;
  const description = org ? org.description : profile.user.publicDescription;
  const location = org ? org.publicLocation : profile.user.publicLocation;

  return <>
    <nav className={styles.tabs} aria-label="Seções da imobiliária">
      {[["imoveis", "Imóveis"], ["sobre", "Sobre"], ["equipe", "Equipe"]].map(([id, label]) => (
        <button key={id} type="button" aria-current={tab === id ? "page" : undefined}
          aria-controls="showcase-section" onClick={() => setTab(id)}>
          {label}{id === "imoveis" && <span>{profile.listings.length}</span>}
        </button>
      ))}
    </nav>
    <section id="showcase-section" className={styles.section}
      aria-label={tab === "imoveis" ? "Catálogo de imóveis" : tab === "sobre" ? "Sobre a imobiliária" : "Equipe"}>
      <div hidden={tab !== "imoveis"}>
        <h2>Encontre seu próximo imóvel</h2>
        <ListingsExplorer listings={profile.listings} showcase />
      </div>
      {tab === "sobre" && <>
        <h2>Sobre</h2>
        <p className={styles.description}>{description || "A imobiliária ainda não cadastrou uma descrição pública."}</p>
        {location && <p>{location}</p>}
        {profile.user.creci && !org && <p>CRECI: {profile.user.creci}</p>}
        {profile.reviews.length > 0 && <div className={styles.reviews}>
          <h3>Avaliações dos imóveis</h3>
          {profile.reviews.map(review => <article key={review.id}>
            <strong>{review.user.name}</strong>
            <p>{review.rating.toLocaleString("pt-BR")} / 5 · {review.listing.name}</p>
            {review.comment && <p>{review.comment}</p>}
            <time dateTime={review.createdAt}>{new Date(review.createdAt).toLocaleDateString("pt-BR", { timeZone: "UTC" })}</time>
          </article>)}
        </div>}
      </>}
      {tab === "equipe" && <>
        <h2>Equipe</h2>
        {org?.members.length ? <div className={styles.team}>
          {org.members.map(({ user }) => <article key={user.id}>
            {user.avatar ? <Image unoptimized src={user.avatar} alt="" width={56} height={56} loading="lazy" />
              : <span className={styles.memberInitial}>{user.name[0]}</span>}
            <strong>{user.name}</strong>
          </article>)}
        </div> : <p>Nenhum membro de equipe cadastrado para exibição.</p>}
      </>}
    </section>
  </>;
}
