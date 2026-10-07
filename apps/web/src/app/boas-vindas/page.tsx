import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { OnboardingForm } from "@/components/auth/OnboardingForm";
import { SiteFooter } from "@/components/SiteFooter";
import { AuthBackgroundPreload } from "@/components/auth/AuthBackgroundPreload";
import { getSessionUser } from "@/lib/session";
import styles from "../cadastro/page.module.css";

export const metadata: Metadata = {
  title: "Boas-vindas | Zhivago",
};

type Props = { searchParams: Promise<{ next?: string }> };

/** Escolha do tipo de uso (pessoal ou imobiliária) após o 1º login com Google. */
export default async function WelcomePage({ searchParams }: Props) {
  const { next } = await searchParams;
  const user = await getSessionUser();

  if (!user) {
    redirect("/login?next=/boas-vindas");
  }
  if (user.onboardingCompleted) {
    const isAgencyAccount = user.accountType === "AGENCY" && user.role !== "ADMIN";
    redirect(isAgencyAccount ? "/dashboard" : "/imoveis");
  }

  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : undefined;

  return (
    <main className={styles.main}>
      <AuthBackgroundPreload />
      <div className={styles.contentArea}>
        <div className={styles.authCard}>
          <div className={styles.cardBody}>
            <OnboardingForm firstName={user.name.split(" ")[0] ?? user.name} next={safeNext} />
          </div>
        </div>
      </div>
      <SiteFooter />
    </main>
  );
}
