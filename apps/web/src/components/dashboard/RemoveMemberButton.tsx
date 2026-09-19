"use client";

import { useActionState } from "react";
import { UserMinus } from "lucide-react";
import { removeMemberAction } from "@/lib/actions/organizations";
import styles from "./TeamSection.module.css";

export function RemoveMemberButton({ userId, name }: { userId: string; name: string }) {
  const [state, formAction, pending] = useActionState(removeMemberAction, undefined);

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (!window.confirm(`Remover ${name} da equipe? Os imóveis atribuídos a ele(a) passam para você.`)) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="userId" value={userId} />
      <button type="submit" disabled={pending} className={styles.removeMemberButton} title="Remover da equipe">
        <UserMinus size={14} />
        {pending ? "Removendo…" : "Remover"}
      </button>
      {state?.error && <p className={styles.removeMemberError}>{state.error}</p>}
    </form>
  );
}
