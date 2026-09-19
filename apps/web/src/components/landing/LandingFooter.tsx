import Link from "next/link";
import shared from "./shared.module.css";
import styles from "./LandingFooter.module.css";

const GROUPS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: "Marketplace",
    links: [
      { label: "Explorar imóveis", href: "/imoveis" },
      { label: "Favoritos", href: "/favoritos" },
      { label: "Anunciar imóvel", href: "/anuncios/novo" },
    ],
  },
  {
    title: "Imobiliárias",
    links: [
      { label: "Para imobiliárias", href: "#crm" },
      { label: "Criar organização", href: "/cadastro" },
    ],
  },
  {
    title: "Conta",
    links: [
      { label: "Entrar", href: "/login" },
      { label: "Cadastre-se", href: "/cadastro" },
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
