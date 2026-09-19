import type { Metadata } from "next";
import Link from "next/link";
import { X } from "lucide-react";
import { LoginForm } from "@/components/auth/LoginForm";
import { SiteFooter } from "@/components/SiteFooter";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Entrar | Zhivago",
};

type Props = { searchParams: Promise<{ next?: string }> };

export default async function LoginPage({ searchParams }: Props) {
  const { next } = await searchParams;

  return (
    <main className={styles.main}>
      <div className={styles.contentArea}>
        <div className={styles.authCard}>
          <div className={styles.cardHeader}>
            <Link href="/" className={styles.closeButton} title="Voltar para a página inicial">
              <X size={20} />
            </Link>
          </div>
          <div className={styles.cardBody}>
            <LoginForm next={next} />
          </div>
        </div>
      </div>
      <SiteFooter />
    </main>
  );
}
