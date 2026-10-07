import Link from "next/link";
import shared from "./shared.module.css";
import styles from "./LandingFooter.module.css";

const GROUPS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: "Explorar",
    links: [
      { label: "Comprar", href: "/imoveis?categoria=venda" },
      { label: "Alugar", href: "/imoveis?categoria=aluguel" },
      { label: "Temporada", href: "/imoveis?categoria=temporada" },
      { label: "Todos os imóveis", href: "/imoveis" },
    ],
  },
  {
    title: "Para anunciantes",
    links: [
      { label: "Anunciar imóvel", href: "/anuncios/novo" },
      { label: "Para imobiliárias", href: "/para-imobiliarias" },
    ],
  },
  {
    title: "Zhivago",
    links: [
      { label: "Ajuda", href: "/ajuda" },
      { label: "Termos de uso", href: "/termos" },
      { label: "Privacidade", href: "/privacidade" },
    ],
  },
  {
    title: "Conta",
    links: [
      { label: "Entrar", href: "/login" },
      { label: "Criar conta", href: "/cadastro" },
      { label: "Favoritos", href: "/favoritos" },
      { label: "Mensagens", href: "/inbox" },
    ],
  },
];

export function LandingFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className={styles.footer}>
      <div className={shared.wrap}>
        <div className={styles.top}>
          <Link href="/" className={styles.logo}>
            zhiv<span>a</span>go
          </Link>

          <div className={styles.groups}>
            {GROUPS.map((group) => (
              <div key={group.title} className={styles.group}>
                <div className={styles.groupTitle}>{group.title}</div>
                {group.links.map((link) => (
                  <Link key={link.label} href={link.href} className={styles.groupLink}>
                    {link.label}
                  </Link>
                ))}
              </div>
            ))}
          </div>
        </div>

        <div className={styles.bottom}>© {year} Zhivago</div>
      </div>
    </footer>
  );
}
