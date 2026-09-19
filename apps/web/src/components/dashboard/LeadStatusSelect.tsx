"use client";

import { useActionState, useRef } from "react";
import { updateLeadStatusAction } from "@/lib/actions/leads";
import type { LeadStatus } from "@zhivago/shared";
import styles from "./LeadControls.module.css";

const STATUS_OPTIONS: { value: LeadStatus; label: string }[] = [
  { value: "NEW", label: "Novo" },
  { value: "CONTACTED", label: "Contatado" },
  { value: "QUALIFIED", label: "Qualificado" },
  { value: "VISIT_SCHEDULED", label: "Visita agendada" },
  { value: "PROPOSAL", label: "Proposta" },
  { value: "NEGOTIATION", label: "Negociação" },
  { value: "WON", label: "Ganho" },
  { value: "LOST", label: "Perdido" },
];

export function LeadStatusSelect({ leadId, currentStatus }: { leadId: string; currentStatus: LeadStatus }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useActionState(updateLeadStatusAction, undefined);

  return (
    <form ref={formRef} action={formAction} className={styles.assignForm}>
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
