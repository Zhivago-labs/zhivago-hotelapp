import Image from "next/image";
import { ListingSkeletons } from "./ListingSkeletons";
import styles from "./LoadingState.module.css";

type Props = { title?: string; description?: string; variant?: "page" | "form" | "profile" | "cards" };

export function LoadingState({ variant = "page" }: Props) {
  if (variant === "cards") return <ListingSkeletons />;
  return (
    <section className={styles.page} role="status" aria-busy="true">
      <span className={styles.srOnly}>Carregando</span>
      <div className={styles.brand} aria-hidden="true">
        <Image src="/images/system/logo.png" alt="" width={798} height={248} sizes="220px" priority className={styles.logo} />
        <div className={styles.track}><span /></div>
      </div>
    </section>
  );
}
