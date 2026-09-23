import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { SiteFooter } from "@/components/SiteFooter";
import styles from "./LegalPageLayout.module.css";

interface LegalPageLayoutProps {
  title: string;
  updatedAt?: string;
  children: React.ReactNode;
}

export function LegalPageLayout({ title, updatedAt, children }: LegalPageLayoutProps) {
  return (
    <>
      <main className={styles.main}>
        <div className={styles.container}>
          <Link href="/" className={styles.backLink}>
            <ArrowLeft size={16} />
            Voltar para o início
          </Link>

          <div className={styles.header}>
            <h1 className={styles.title}>{title}</h1>
            {updatedAt && <p className={styles.updatedAt}>Última atualização em {updatedAt}</p>}
          </div>

          <div className={styles.card}>{children}</div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
