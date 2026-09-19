import type { AdminAgencyUser } from "@/lib/admin-api";
import { verifyAgencyAction, unverifyAgencyAction } from "@/lib/actions/admin";
import { ActionForm } from "@/components/ActionForm";
import styles from "./AgencyAccountCard.module.css";

export function AgencyAccountCard({ user }: { user: AdminAgencyUser }) {
  const status = user.verified
    ? { label: "Verificada", color: "#22c55e" }
    : { label: "Pendente", color: "#f59e0b" };

  return (
    <div className={styles.card}>
      <span className={styles.statusBadge} style={{ background: `${status.color}22`, color: status.color }}>
        <span className={styles.statusDot} style={{ background: status.color }} />
        {status.label}
      </span>

      <div className={styles.body}>
        <p className={styles.name}>{user.companyName || user.name}</p>
        {user.companyName && <p className={styles.responsible}>Responsável: {user.name}</p>}
        <p className={styles.detail}>{user.email}</p>
        {user.phone && <p className={styles.detail}>{user.phone}</p>}
        {user.document && <p className={styles.detail}>CNPJ/CPF: {user.document}</p>}
        {user.creci && <p className={styles.detail}>CRECI: {user.creci}</p>}

        <div className={styles.actions}>
          {!user.verified && (
            <ActionForm action={verifyAgencyAction}>
              <input type="hidden" name="id" value={user.id} />
              <button type="submit" className={styles.verifyButton}>
                Verificar
              </button>
            </ActionForm>
          )}

          {user.verified && (
            <ActionForm action={unverifyAgencyAction}>
              <input type="hidden" name="id" value={user.id} />
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
