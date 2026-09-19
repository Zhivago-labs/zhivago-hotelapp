import type { AdminOrganization } from "@/lib/admin-api";
import { verifyOrganizationAction, unverifyOrganizationAction } from "@/lib/actions/admin";
import { ActionForm } from "@/components/ActionForm";
import styles from "./AgencyAccountCard.module.css";

export function OrganizationAccountCard({ organization }: { organization: AdminOrganization }) {
  const owner = organization.members[0]?.user;
  const status = organization.verified
    ? { label: "Verificada", color: "#22c55e" }
    : { label: "Pendente", color: "#f59e0b" };

  return (
    <div className={styles.card}>
      <span className={styles.statusBadge} style={{ background: `${status.color}22`, color: status.color }}>
        <span className={styles.statusDot} style={{ background: status.color }} />
        {status.label}
      </span>

      <div className={styles.body}>
        <p className={styles.name}>{organization.name}</p>
        {owner && <p className={styles.responsible}>Dono: {owner.name}</p>}
        {owner && <p className={styles.detail}>{owner.email}</p>}
        {owner?.phone && <p className={styles.detail}>{owner.phone}</p>}
        <p className={styles.detail}>CNPJ: {organization.document}</p>

        <div className={styles.actions}>
          {!organization.verified && (
            <ActionForm action={verifyOrganizationAction}>
              <input type="hidden" name="id" value={organization.id} />
              <button type="submit" className={styles.verifyButton}>
                Verificar
              </button>
            </ActionForm>
          )}

          {organization.verified && (
            <ActionForm action={unverifyOrganizationAction}>
              <input type="hidden" name="id" value={organization.id} />
              <button type="submit" className={styles.unverifyButton}>
                Remover verificação
              </button>
            </ActionForm>
          )}
        </div>
      </div>
    </div>
  );
}
