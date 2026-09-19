import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft } from "lucide-react";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";
import { SiteFooter } from "@/components/SiteFooter";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Recuperar Senha | Zhivago",
};

export default function ForgotPasswordPage() {
  return (
    <main className={styles.main}>
      <div className={styles.contentArea}>
        <div className={styles.authCard}>
          <div className={styles.cardHeader}>
            <Link href="/login" className={styles.closeButton} title="Voltar ao login">
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
              <h1 className={styles.welcomeTitle}>Recuperar Senha</h1>
              <p className={styles.welcomeSubtitle}>
                Digite seu e-mail para receber um código de recuperação de 6 dígitos.
              </p>
            </div>
            <ForgotPasswordForm />
          </div>
        </div>
      </div>
      <SiteFooter />
    </main>
  );
}
