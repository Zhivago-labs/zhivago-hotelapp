import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft } from "lucide-react";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import { SiteFooter } from "@/components/SiteFooter";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Redefinir Senha | Zhivago",
};

type Props = { searchParams: Promise<{ email?: string }> };

export default async function ResetPasswordPage({ searchParams }: Props) {
  const { email } = await searchParams;

  return (
    <main className={styles.main}>
      <div className={styles.contentArea}>
        <div className={styles.authCard}>
          <div className={styles.cardHeader}>
            <Link href="/esqueci-senha" className={styles.closeButton} title="Voltar">
              <ArrowLeft size={18} />
            </Link>
          </div>
          <div className={styles.cardBody}>
            <div className={styles.brandHeader}>
              <Link href="/" className={styles.logoLink} title="Ir para o início">
                <Image
                  src="/images/system/Gemini_Generated_Image_(1).png"
                  alt="Zhivago Logo"
                  width={170}
                  height={50}
                  className={styles.brandLogo}
                  priority
                />
              </Link>
              <h1 className={styles.welcomeTitle}>Criar Nova Senha</h1>
              <p className={styles.welcomeSubtitle}>
                Insira o código de 6 dígitos enviado para seu e-mail e escolha sua nova senha.
              </p>
            </div>
            <ResetPasswordForm initialEmail={email} />
          </div>
        </div>
      </div>
      <SiteFooter />
    </main>
  );
}
