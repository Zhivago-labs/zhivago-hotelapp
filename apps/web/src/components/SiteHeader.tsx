import Link from "next/link";
import Image from "next/image";
import { getSessionUser } from "@/lib/session";
import { HeaderNav } from "@/components/HeaderNav";
import styles from "./SiteHeader.module.css";

export async function SiteHeader() {
  const user = await getSessionUser();
  // Contas de imobiliária são "back-office" — não navegam o marketplace público,
  // então o link "Explorar" (que só as devolveria pro dashboard) fica escondido.
  const isAgencyAccount = user?.accountType === "AGENCY" && user.role !== "ADMIN";

  return (
    <header className={styles.header}>
      <div className={styles.container}>
        <Link href="/" className={styles.logo}>
          <Image
            src="/images/system/logo.png"
            alt="Logo"
            width={180}
            height={54}
            className={styles.logoImage}
            priority
          />
        </Link>

        <HeaderNav user={user} isAgencyAccount={isAgencyAccount} />
      </div>
    </header>
  );
}


