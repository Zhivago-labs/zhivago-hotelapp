import Link from "next/link";
import type { Metadata } from "next";
import { requireAuth } from "@/lib/session";
import { ProfileForm } from "@/components/settings/ProfileForm";
import { PasswordForm } from "@/components/settings/PasswordForm";
import { PushNotificationOptIn } from "@/components/PushNotificationOptIn";
import { AgencyBadge } from "@/components/AgencyBadge";
import {
  Settings,
  ArrowLeft,
  User,
  Shield,
  Bell,
  Building2,
  Mail,
  CheckCircle,
  FileText,
} from "lucide-react";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Configurações da Conta — Zhivago",
};

export default async function SettingsPage() {
  const { token, user } = await requireAuth("/configuracoes");

  return (
    <main className={styles.main}>
      <div className={styles.container}>
        {/* Cabeçalho */}
        <div className={styles.header}>
          <Link href={user.role === "ADMIN" ? "/imoveis" : "/dashboard"} className={styles.backLink}>
            <ArrowLeft size={18} />
            {user.role === "ADMIN" ? "Voltar aos imóveis" : "Voltar ao Dashboard"}
          </Link>
          <div className={styles.titleRow}>
            <h1 className={styles.title}>
              <Settings size={28} className={styles.titleIcon} />
              Configurações da Conta
            </h1>
            <AgencyBadge verified={user.accountType === "AGENCY" && user.verified} />
          </div>
          <p className={styles.subtitle}>
            Gerencie suas informações pessoais, credenciais de acesso, preferências de notificações e conta.
          </p>
        </div>

        <div className={styles.grid}>
          {/* Seção 1: Dados Pessoais */}
          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <User size={20} className={styles.cardIcon} />
              <div>
                <h2 className={styles.cardTitle}>Informações de Perfil</h2>
                <p className={styles.cardSubtitle}>
                  Atualize como seu nome e contato aparecem nos anúncios e conversas.
                </p>
              </div>
            </div>
            <ProfileForm
              initialName={user.name}
              initialPhone={user.phone}
              initialAvatar={user.avatar}
              initialCompanyName={user.companyName}
              initialCreci={user.creci}
              isAgency={user.accountType === "AGENCY"}
              token={token}
            />
          </section>

          {/* Seção 2: Alteração de Senha */}
          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <Shield size={20} className={styles.cardIcon} />
              <div>
                <h2 className={styles.cardTitle}>Segurança e Senha</h2>
                <p className={styles.cardSubtitle}>
                  Altere sua senha de acesso periodicamente para manter sua conta protegida.
                </p>
              </div>
            </div>
            <PasswordForm token={token} />
          </section>

          {/* Seção 3: Notificações */}
          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <Bell size={20} className={styles.cardIcon} />
              <div>
                <h2 className={styles.cardTitle}>Notificações do Sistema</h2>
                <p className={styles.cardSubtitle}>
                  Receba alertas em tempo real sobre novas mensagens e solicitações de reservas.
                </p>
              </div>
            </div>
            <div className={styles.optInWrapper}>
              <PushNotificationOptIn token={token} variant="menuItem" />
            </div>
          </section>

          {/* Seção 4: Detalhes da Conta */}
          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <Building2 size={20} className={styles.cardIcon} />
              <div>
                <h2 className={styles.cardTitle}>Detalhes da Conta</h2>
                <p className={styles.cardSubtitle}>
                  Informações de registro da sua conta na plataforma.
                </p>
              </div>
            </div>
            <div className={styles.accountDetails}>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>
                  <Mail size={16} /> E-mail Cadastrado
                </span>
                <span className={styles.detailValue}>{user.email}</span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>
                  <User size={16} /> Tipo de Conta
                </span>
                <span className={styles.detailValue}>
                  {user.accountType === "AGENCY" ? "Imobiliária / Anunciante Corporativo" : "Usuário / Anunciante Individual"}
                </span>
              </div>
              {user.companyName && (
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>
                    <Building2 size={16} /> Razão Social / Imobiliária
                  </span>
                  <span className={styles.detailValue}>{user.companyName}</span>
                </div>
              )}
              {user.creci && (
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>
                    <FileText size={16} /> CRECI
                  </span>
                  <span className={styles.detailValue}>{user.creci}</span>
                </div>
              )}
              {user.verified && (
                <div className={styles.verifiedBadge}>
                  <CheckCircle size={16} />
                  <span>Conta Verificada Zhivago</span>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
