"use client";

import { useActionState, useRef } from "react";
import { updateVisitStatusAction } from "@/lib/actions/leads";
import type { VisitStatus } from "@zhivago/shared";
import styles from "./LeadControls.module.css";

const STATUS_OPTIONS: { value: VisitStatus; label: string }[] = [
  { value: "SCHEDULED", label: "Agendada" },
  { value: "CONFIRMED", label: "Confirmada" },
  { value: "COMPLETED", label: "Concluída" },
  { value: "CANCELLED", label: "Cancelada" },
  { value: "NO_SHOW", label: "Não compareceu" },
];

export function VisitStatusSelect({
  visitId,
  leadId,
  currentStatus,
}: {
  visitId: string;
  leadId: string;
  currentStatus: VisitStatus;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useActionState(updateVisitStatusAction, undefined);

  return (
    <form ref={formRef} action={formAction} className={styles.assignForm}>
      <input type="hidden" name="visitId" value={visitId} />
      <input type="hidden" name="leadId" value={leadId} />
      <select
        name="status"
        defaultValue={currentStatus}
        className={styles.select}
        onChange={() => formRef.current?.requestSubmit()}
      >
        {STATUS_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {state?.error && <p className={styles.error}>{state.error}</p>}
    </form>
  );
}
