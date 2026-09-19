"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Compass,
  Plus,
  Heart,
  Menu,
  X,
  User,
  LayoutDashboard,
  Building2,
  Settings,
  CalendarRange,
  Shield,
  LogOut,
  MessageCircle,
} from "lucide-react";
import { UserMenu } from "@/components/UserMenu";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { logoutAction } from "@/lib/actions/auth";
import { useChatSocket } from "@/components/chat/ChatSocketProvider";
import styles from "./SiteHeader.module.css";

interface HeaderNavProps {
  user: {
    name: string;
    avatar: string | null;
    role: string;
    accountType?: string;
  } | null;
  isAgencyAccount: boolean;
}

export function HeaderNav({ user, isAgencyAccount }: HeaderNavProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { openSidebar, unreadCount } = useChatSocket();

  // Fechar menu mobile em resize para tela desktop
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 768) {
        setMobileOpen(false);
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <>
      {/* NAVEGAÇÃO DESKTOP */}
      <nav className={styles.navDesktop}>
        {!isAgencyAccount && (
          <>
            <Link href="/imoveis" className={styles.navLink}>
              <Compass size={16} />
              <span>Explorar</span>
            </Link>
            <Link href="/favoritos" className={styles.navLink}>
              <Heart size={16} />
              <span>Favoritos</span>
            </Link>
          </>
        )}

        {user ? (
          <>
            {user.role !== "ADMIN" && (
              <Link href="/anuncios/novo" className={styles.navPrimary}>
                <Plus size={16} />
                <span>Anunciar</span>
              </Link>
            )}

            <NotificationBell />
            <UserMenu user={user} />
          </>
        ) : (
          <>
            <Link href="/login?next=/anuncios/novo" className={styles.navLink}>
              <Plus size={16} />
              <span>Anunciar</span>
            </Link>
            <span className={styles.divider} />
            <Link href="/login" className={styles.navLink}>
              Entrar
            </Link>
            <Link href="/cadastro" className={styles.signUpButton}>
              Cadastre-se
            </Link>
          </>
        )}
      </nav>

      {/* BOTÃO HAMBÚRGUER MOBILE */}
      <button
        type="button"
        className={styles.mobileMenuToggle}
        onClick={() => setMobileOpen(!mobileOpen)}
        aria-label={mobileOpen ? "Fechar menu" : "Abrir menu de navegação"}
      >
        {mobileOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      {/* DRAWER / MENU MOBILE */}
      {mobileOpen && (
        <div className={styles.mobileOverlay} onClick={() => setMobileOpen(false)}>
          <div className={styles.mobileDrawer} onClick={(e) => e.stopPropagation()}>
            <div className={styles.mobileHeader}>
              <span className={styles.mobileTitle}>Menu Zhivago</span>
              <button
                type="button"
                className={styles.mobileCloseBtn}
                onClick={() => setMobileOpen(false)}
              >
                <X size={20} />
              </button>
            </div>

            <div className={styles.mobileNavLinks}>
              {!isAgencyAccount && (
                <>
                  <Link href="/imoveis" className={styles.mobileNavLink} onClick={() => setMobileOpen(false)}>
                    <Compass size={18} />
                    <span>Explorar Imóveis</span>
                  </Link>
                  <Link href="/favoritos" className={styles.mobileNavLink} onClick={() => setMobileOpen(false)}>
                    <Heart size={18} />
                    <span>Meus Favoritos</span>
                  </Link>
                </>
              )}

              {user ? (
                <>
                  <div className={styles.mobileDivider} />
                  <div className={styles.mobileUserBadge}>
                    <div className={styles.mobileUserIdentity}>
                      <div className={styles.mobileAvatar}>
                        {user.avatar ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={user.avatar} alt={user.name} />
                        ) : (
                          <User size={18} />
                        )}
                      </div>
                      <div>
                        <p className={styles.mobileUserName}>{user.name}</p>
                        <p className={styles.mobileUserRole}>Minha Conta</p>
                      </div>
                    </div>
                    <NotificationBell />
                  </div>

                  <button
                    type="button"
                    className={styles.mobileNavLink}
                    onClick={() => {
                      setMobileOpen(false);
                      openSidebar();
                    }}
                  >
                    <MessageCircle size={18} />
                    <span>Mensagens</span>
                    {unreadCount > 0 && <span className={styles.mobileBadge}>{unreadCount}</span>}
                  </button>

                  <Link href="/dashboard" className={styles.mobileNavLink} onClick={() => setMobileOpen(false)}>
                    <LayoutDashboard size={18} />
                    <span>Dashboard</span>
                  </Link>

                  {user.role !== "ADMIN" && (
                    <Link href="/meus-anuncios" className={styles.mobileNavLink} onClick={() => setMobileOpen(false)}>
                      <Building2 size={18} />
                      <span>Meus Anúncios</span>
                    </Link>
                  )}

                  {user.accountType !== "AGENCY" && user.role !== "ADMIN" && (
                    <Link href="/minhas-reservas" className={styles.mobileNavLink} onClick={() => setMobileOpen(false)}>
                      <CalendarRange size={18} />
                      <span>Minhas Reservas</span>
                    </Link>
                  )}

                  {user.role === "ADMIN" && (
                    <Link href="/admin" className={styles.mobileNavLink} onClick={() => setMobileOpen(false)}>
                      <Shield size={18} />
                      <span>Painel Admin</span>
                    </Link>
                  )}

                  <Link href="/configuracoes" className={styles.mobileNavLink} onClick={() => setMobileOpen(false)}>
                    <Settings size={18} />
                    <span>Configurações</span>
                  </Link>

                  {user.role !== "ADMIN" && (
                    <Link href="/anuncios/novo" className={styles.mobileNavPrimary} onClick={() => setMobileOpen(false)}>
                      <Plus size={18} />
                      <span>Anunciar Imóvel</span>
                    </Link>
                  )}

                  <div className={styles.mobileDivider} />

                  <form action={logoutAction}>
                    <button type="submit" className={styles.mobileLogoutBtn}>
                      <LogOut size={18} />
                      <span>Sair da conta</span>
                    </button>
                  </form>
                </>
              ) : (
                <>
                  <div className={styles.mobileDivider} />
                  <Link href="/anuncios/novo" className={styles.mobileNavPrimary} onClick={() => setMobileOpen(false)}>
                    <Plus size={18} />
                    <span>Anunciar Imóvel</span>
                  </Link>
                  <Link href="/login" className={styles.mobileNavLink} onClick={() => setMobileOpen(false)}>
                    Entrar
                  </Link>
                  <Link href="/cadastro" className={styles.mobileSignUpBtn} onClick={() => setMobileOpen(false)}>
                    Cadastre-se
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
