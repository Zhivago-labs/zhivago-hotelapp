"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import styles from "./LandingNav.module.css";

export function LandingNav() {
  const [menuOpen, setMenuOpen] = useState(false);

  // Fecha o menu mobile com Esc, e ao redimensionar pra além do breakpoint mobile.
  useEffect(() => {
    if (!menuOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    const handleResize = () => {
      if (window.innerWidth > 720) setMenuOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleResize);
    };
  }, [menuOpen]);

  return (
    <nav className={styles.nav}>
      <div className={styles.navInner}>
        <Link href="/" className={styles.logo}>
          zhiv<span>a</span>go
        </Link>
        <div className={styles.navLinks}>
          <Link href="/imoveis" className={styles.navLink}>
            Explorar
          </Link>
          <Link href="/anuncios/novo" className={styles.navLink}>
            Anunciar imóvel
          </Link>
          <Link href="#crm" className={styles.navLink}>
            Para imobiliárias
          </Link>
          <Link href="/login" className={styles.navLink}>
            Entrar
          </Link>
          <Link href="/cadastro" className={styles.navCta}>
            Cadastre-se
          </Link>
          <button
            type="button"
            className={styles.menuToggle}
            aria-label={menuOpen ? "Fechar menu" : "Abrir menu"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            )}
          </button>
        </div>
      </div>

      <div className={styles.mobilePanel} data-open={menuOpen}>
        <Link href="/imoveis" onClick={() => setMenuOpen(false)}>
          Explorar
        </Link>
        <Link href="/anuncios/novo" onClick={() => setMenuOpen(false)}>
          Anunciar imóvel
        </Link>
        <Link href="#crm" onClick={() => setMenuOpen(false)}>
          Para imobiliárias
        </Link>
        <Link href="/login" onClick={() => setMenuOpen(false)}>
          Entrar
        </Link>
        <Link href="/cadastro" onClick={() => setMenuOpen(false)}>
          Cadastre-se
        </Link>
      </div>
    </nav>
  );
}
