"use client";

import { useActionState } from "react";
import { addTaskAction } from "@/lib/actions/leads";
import styles from "./LeadControls.module.css";

export function AddTaskForm({ leadId }: { leadId: string }) {
  const [state, formAction, pending] = useActionState(addTaskAction, undefined);

  return (
    <form action={formAction} className={styles.distributionForm}>
      <input type="hidden" name="leadId" value={leadId} />
      <input type="text" name="title" placeholder="Ex: Ligar para confirmar visita" className={styles.input} required />
      <input type="datetime-local" name="dueAt" className={styles.input} />
      <button type="submit" disabled={pending} className={styles.submitButton}>
        {pending ? "Adicionando…" : "Adicionar tarefa"}
      </button>
      {state?.error && <p className={styles.error}>{state.error}</p>}
    </form>
  );
}
