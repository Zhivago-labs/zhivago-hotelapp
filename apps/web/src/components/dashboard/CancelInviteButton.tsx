"use client";

import { useActionState } from "react";
import { X } from "lucide-react";
import { cancelInviteAction } from "@/lib/actions/organizations";
import styles from "./TeamSection.module.css";

export function CancelInviteButton({ id }: { id: string }) {
  const [state, formAction, pending] = useActionState(cancelInviteAction, undefined);

  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={id} />
      <button type="submit" disabled={pending} className={styles.removeMemberButton} title="Cancelar convite">
        <X size={14} />
        {pending ? "Cancelando…" : "Cancelar"}
      </button>
      {state?.error && <p className={styles.removeMemberError}>{state.error}</p>}
    </form>
  );
}
