"use client";

import { useActionState, useRef } from "react";
import { updateLeadDistributionModeAction } from "@/lib/actions/leads";
import type { LeadDistributionMode } from "@zhivago/shared";
import styles from "./LeadControls.module.css";

export function LeadDistributionModeToggle({ mode }: { mode: LeadDistributionMode }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useActionState(updateLeadDistributionModeAction, undefined);

  return (
    <form ref={formRef} action={formAction} className={styles.distributionForm}>
      <label className={styles.distributionLabel}>
        Distribuição de leads:
        <select
          name="mode"
          defaultValue={mode}
          className={styles.select}
          onChange={() => formRef.current?.requestSubmit()}
        >
          <option value="MANUAL">Manual</option>
          <option value="ROUND_ROBIN">Round robin</option>
        </select>
      </label>
      {state?.error && <p className={styles.error}>{state.error}</p>}
    </form>
  );
}
