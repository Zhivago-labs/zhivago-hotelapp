"use client";

import { useActionState } from "react";
import { toggleTaskCompletedAction } from "@/lib/actions/leads";
import styles from "./LeadControls.module.css";

export function TaskCompleteToggle({
  taskId,
  leadId,
  completed,
}: {
  taskId: string;
  leadId: string;
  completed: boolean;
}) {
  const [state, formAction, pending] = useActionState(toggleTaskCompletedAction, undefined);

  return (
    <form action={formAction} style={{ display: "inline" }}>
      <input type="hidden" name="taskId" value={taskId} />
      <input type="hidden" name="leadId" value={leadId} />
      <input type="hidden" name="completed" value={String(!completed)} />
      <button type="submit" disabled={pending} className={styles.submitButton}>
        {completed ? "Reabrir" : "Concluir"}
      </button>
      {state?.error && <p className={styles.error}>{state.error}</p>}
    </form>
  );
}
