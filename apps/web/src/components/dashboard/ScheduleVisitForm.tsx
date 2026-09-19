"use client";

import { useActionState } from "react";
import { scheduleVisitAction } from "@/lib/actions/leads";
import styles from "./LeadControls.module.css";

export function ScheduleVisitForm({ leadId }: { leadId: string }) {
  const [state, formAction, pending] = useActionState(scheduleVisitAction, undefined);

  return (
    <form action={formAction} className={styles.distributionForm}>
      <input type="hidden" name="leadId" value={leadId} />
      <input type="datetime-local" name="scheduledAt" className={styles.input} required />
      <textarea name="notes" placeholder="Observações (opcional)" className={styles.textarea} />
      <button type="submit" disabled={pending} className={styles.submitButton}>
        {pending ? "Agendando…" : "Agendar visita"}
      </button>
      {state?.error && <p className={styles.error}>{state.error}</p>}
    </form>
  );
}
