import type { SlaStatus } from "@zhivago/shared";
import styles from "./SlaBadge.module.css";

const LABELS: Record<SlaStatus, string> = {
  UNASSIGNED: "Não atribuído",
  ON_TIME: "No prazo",
  AT_RISK: "Em risco",
  OVERDUE: "Atrasado",
};

export function SlaBadge({ status, hideOnTime = true }: { status: SlaStatus; hideOnTime?: boolean }) {
  if (hideOnTime && (status === "ON_TIME" || status === "UNASSIGNED")) return null;

  const toneClass = status === "OVERDUE" ? styles.overdue : status === "AT_RISK" ? styles.atRisk : styles.neutral;

  return <span className={`${styles.badge} ${toneClass}`}>{LABELS[status]}</span>;
}
