"use client";

import { useActionState } from "react";
import { UserPlus, Mail } from "lucide-react";
import { inviteMemberAction } from "@/lib/actions/organizations";
import styles from "./TeamSection.module.css";
import formStyles from "@/components/listings/ListingForm.module.css";

export function InviteMemberForm() {
  const [state, formAction, pending] = useActionState(inviteMemberAction, undefined);

  return (
    <div className={styles.addMemberBox}>
      <div className={styles.addMemberHeader}>
        <UserPlus size={18} className={styles.addMemberIcon} />
        <div>
          <h4 className={styles.addMemberTitle}>Convidar Membro</h4>
          <p className={styles.addMemberSubtitle}>
            Envie um convite por e-mail — a pessoa entra na organização só depois de aceitar.
          </p>
        </div>
      </div>

      <form action={formAction}>
        {state?.error && <p className={formStyles.error}>{state.error}</p>}
        <div className={styles.inlineForm}>
          <div className={styles.inputWrapper}>
            <Mail size={16} className={styles.inputIcon} />
            <input
              name="email"
              type="email"
              placeholder="E-mail do convidado"
              required
              className={styles.inlineInputWithIcon}
            />
          </div>
          <select name="role" defaultValue="BROKER" className={styles.inlineInput} required>
            <option value="BROKER">Corretor</option>
            <option value="MANAGER">Gerente</option>
            <option value="ADMIN">Administrador</option>
          </select>
          <button type="submit" disabled={pending} className={styles.primaryInlineButton}>
            {pending ? "Enviando…" : "Enviar Convite"}
          </button>
        </div>
      </form>
    </div>
  );
}
