"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { LayoutDashboard, Building2, Settings, LogOut, User, ChevronDown, Shield, CalendarRange, MessageCircle } from "lucide-react";
import { logoutAction } from "@/lib/actions/auth";
import { ThemeToggle } from "@/components/ThemeToggle";
import { PushNotificationOptIn } from "@/components/PushNotificationOptIn";
import { useChatSocket } from "@/components/chat/ChatSocketProvider";
import styles from "./UserMenu.module.css";

interface UserMenuProps {
  user: {
    name: string;
    avatar: string | null;
    role: string;
    accountType?: string;
  };
}

export function UserMenu({ user }: UserMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { openSidebar, unreadCount } = useChatSocket();

  const firstName = user.name.split(" ")[0];

  // Fechar o dropdown ao clicar fora
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  return (
    <div className={styles.container} ref={menuRef}>
      <button 
        type="button" 
        className={`${styles.trigger} ${isOpen ? styles.triggerActive : ""}`} 
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="true"
        aria-expanded={isOpen}
      >
        <div className={styles.avatarWrap}>
          {user.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.avatar} alt={user.name} className={styles.avatar} />
          ) : (
            <div className={styles.avatarPlaceholder}>
              <User size={16} />
            </div>
          )}
        </div>
        <span className={styles.name}>{firstName}</span>
        <ChevronDown size={14} className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ""}`} />
      </button>

      {isOpen && (
        <div className={styles.dropdown}>
          <div className={styles.header}>
            <p className={styles.userName}>{user.name}</p>
            <p className={styles.userRole}>Minha Conta</p>
          </div>

          <div className={styles.divider} />

          <div className={styles.links}>
            {user.role !== "ADMIN" && (
              <Link
                href="/dashboard"
                className={styles.dropdownLink}
                onClick={() => setIsOpen(false)}
              >
                <LayoutDashboard size={16} />
                <span>Dashboard</span>
              </Link>
            )}

            <button
              type="button"
              className={styles.dropdownLink}
              style={{ background: "none", border: "none", width: "100%", textAlign: "left", cursor: "pointer", fontFamily: "inherit" }}
              onClick={() => {
                setIsOpen(false);
                openSidebar();
              }}
            >
              <MessageCircle size={16} />
              <span>Mensagens</span>
              {unreadCount > 0 && <span className={styles.unreadBadge}>{unreadCount}</span>}
            </button>

            {user.role !== "ADMIN" && (
              <Link
                href="/meus-anuncios"
                className={styles.dropdownLink}
                onClick={() => setIsOpen(false)}
              >
                <Building2 size={16} />
                <span>Meus Anúncios</span>
              </Link>
            )}

            {user.accountType !== "AGENCY" && user.role !== "ADMIN" && (
              <Link
                href="/minhas-reservas"
                className={styles.dropdownLink}
                onClick={() => setIsOpen(false)}
              >
                <CalendarRange size={16} />
                <span>Minhas Reservas</span>
              </Link>
            )}

            {user.role === "ADMIN" && (
              <Link
                href="/admin"
                className={styles.dropdownLink}
                onClick={() => setIsOpen(false)}
              >
                <Shield size={16} />
                <span>Painel Admin</span>
              </Link>
            )}

            <Link
              href="/configuracoes"
              className={styles.dropdownLink}
              onClick={() => setIsOpen(false)}
            >
              <Settings size={16} />
              <span>Configurações</span>
            </Link>

            <ThemeToggle variant="menuItem" />
            <PushNotificationOptIn variant="menuItem" />
          </div>

          <div className={styles.divider} />

          <form action={logoutAction} className={styles.logoutForm}>
            <button type="submit" className={styles.logoutButton}>
              <LogOut size={16} />
              <span>Sair da conta</span>
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
