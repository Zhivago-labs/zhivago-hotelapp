import { Mail } from "lucide-react";
import type { OrganizationInvite } from "@zhivago/shared";
import { acceptInviteAction, declineInviteAction } from "@/lib/actions/organizations";
import { ActionForm } from "@/components/ActionForm";
import styles from "./PendingInviteCard.module.css";

const ROLE_LABELS: Record<string, string> = {
  OWNER: "Proprietário",
  ADMIN: "Administrador",
  MANAGER: "Gerente",
  BROKER: "Corretor",
};

export function PendingInviteCard({ invite }: { invite: OrganizationInvite }) {
  return (
    <div className={styles.card}>
      <div className={styles.icon}>
        <Mail size={18} />
      </div>
      <div className={styles.info}>
        <p className={styles.text}>
          Você foi convidado para <strong>{invite.organization?.name ?? "uma organização"}</strong> como{" "}
          <strong>{ROLE_LABELS[invite.role] ?? invite.role}</strong>.
        </p>
      </div>
      <div className={styles.actions}>
        <ActionForm action={acceptInviteAction} className={styles.inlineForm}>
          <input type="hidden" name="token" value={invite.token} />
          <button type="submit" className={styles.acceptButton}>
            Aceitar
          </button>
        </ActionForm>
        <ActionForm action={declineInviteAction} className={styles.inlineForm}>
          <input type="hidden" name="token" value={invite.token} />
          <button type="submit" className={styles.declineButton}>
            Recusar
          </button>
        </ActionForm>
      </div>
    </div>
  );
}
