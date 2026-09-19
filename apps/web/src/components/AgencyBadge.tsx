import { BadgeCheck } from "lucide-react";
import styles from "./AgencyBadge.module.css";

export function AgencyBadge({ verified }: { verified: boolean }) {
  if (!verified) return null;

  return (
    <span className={styles.badge}>
      <BadgeCheck size={14} />
      Imobiliária verificada
    </span>
  );
}
