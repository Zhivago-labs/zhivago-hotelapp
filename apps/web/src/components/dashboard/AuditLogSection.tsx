import { FileClock } from "lucide-react";
import type { OrganizationAuditLogEntry } from "@zhivago/shared";
import styles from "./TeamSection.module.css";

const ACTION_LABELS: Record<string, string> = {
  BUILDING_LEAD_OWNER_CHANGED: "Lead Owner do empreendimento alterado",
  BUILDING_BACKUP_CHANGED: "Backup do empreendimento alterado",
  LISTING_ORG_APPROVED: "Anúncio aprovado",
  LISTING_ORG_REJECTED: "Anúncio rejeitado",
};

/** Log de auditoria da organização (seção 125 da spec) — só OWNER/ADMIN veem esta seção. */
export function AuditLogSection({ entries }: { entries: OrganizationAuditLogEntry[] }) {
  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <FileClock size={18} className={styles.titleIcon} />
        <div>
          <h2 className={styles.sectionTitle}>Auditoria</h2>
          <p className={styles.sectionSubtitle}>
            Mudanças de responsabilidade de empreendimento e moderação de imóvel — quem, quando e por quê.
          </p>
        </div>
      </div>

      {entries.length === 0 ? (
        <p className={styles.sectionSubtitle}>Nenhum registro de auditoria ainda.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {entries.map((entry) => (
            <div key={entry.id} className={styles.memberCard} style={{ flexDirection: "column", alignItems: "flex-start" }}>
              <span className={styles.memberName}>{ACTION_LABELS[entry.action] ?? entry.action}</span>
              <span className={styles.memberEmail}>
                {entry.actor.user?.name ?? "—"} · {new Date(entry.createdAt).toLocaleString("pt-BR")}
              </span>
              {entry.reason && <span className={styles.memberEmail}>Motivo: {entry.reason}</span>}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
