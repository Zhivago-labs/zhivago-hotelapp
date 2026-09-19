"use client";

import { useActionState } from "react";
import { addInteractionAction } from "@/lib/actions/leads";
import styles from "./LeadControls.module.css";

const TYPE_OPTIONS = [
  { value: "PHONE_CALL", label: "Ligação" },
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "EMAIL", label: "E-mail" },
  { value: "NOTE", label: "Nota" },
  { value: "VISIT", label: "Visita" },
];

export function AddInteractionForm({ leadId }: { leadId: string }) {
  const [state, formAction, pending] = useActionState(addInteractionAction, undefined);

  return (
    <form action={formAction} className={styles.distributionForm}>
      <input type="hidden" name="leadId" value={leadId} />
      <select name="type" defaultValue="NOTE" className={styles.select} required>
        {TYPE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <textarea name="content" placeholder="O que foi conversado? (opcional)" className={styles.textarea} />
      <button type="submit" disabled={pending} className={styles.submitButton}>
        {pending ? "Registrando…" : "Registrar contato"}
      </button>
      {state?.error && <p className={styles.error}>{state.error}</p>}
    </form>
  );
}
