"use client";

import { useActionState, useRef } from "react";
import { updateReceiveLeadsAction } from "@/lib/actions/organizations";
import styles from "./LeadControls.module.css";

export function ReceiveLeadsToggle({
  userId,
  receiveLeads,
}: {
  userId: string;
  receiveLeads: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useActionState(updateReceiveLeadsAction, undefined);

  return (
    <form ref={formRef} action={formAction} className={styles.assignForm}>
      <input type="hidden" name="userId" value={userId} />
      <label className={styles.distributionLabel}>
        <input
          type="checkbox"
          name="receiveLeads"
          value="true"
          defaultChecked={receiveLeads}
          onChange={() => formRef.current?.requestSubmit()}
        />
        Recebe leads
      </label>
      {state?.error && <p className={styles.error}>{state.error}</p>}
    </form>
  );
}
