import type { Metadata } from "next";
import Link from "next/link";
import { LandingNav } from "@/components/landing/LandingNav";
import { CrmSection } from "@/components/landing/CrmSection";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { fraunces, inter } from "@/components/landing/fonts";
import shared from "@/components/landing/shared.module.css";
import rootStyles from "../page.module.css";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Para imobiliárias",
  description:
    "Publique os imóveis da sua imobiliária no Zhivago e organize leads, equipe e negociações em um CRM integrado ao marketplace.",
};

export default function ParaImobiliariasPage() {
  return (
    <div className={`${rootStyles.landingRoot} ${fraunces.variable} ${inter.variable}`}>
      <LandingNav />
      <main>
        <header className={styles.intro}>
          <div className={shared.wrap}>
            <div className={shared.sectionKicker}>Zhivago para imobiliárias</div>
            <h1 className={styles.title}>Seus imóveis no marketplace e seus leads organizados no mesmo lugar.</h1>
            <p className={styles.sub}>
              Publique sua carteira, convide sua equipe e acompanhe cada interessado do primeiro contato até o
              fechamento.
            </p>
            <div className={styles.ctas}>
              <Link href="/cadastro" className={shared.btnPrimary}>
                Criar conta de imobiliária
              </Link>
              <Link href="/login" className={shared.btnSecondary}>
                Já tenho conta
              </Link>
            </div>
          </div>
        </header>
        <CrmSection />
      </main>
      <LandingFooter />
    </div>
  );
}
