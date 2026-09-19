"use client";

import { useActionState, useRef } from "react";
import { assignLeadAction } from "@/lib/actions/leads";
import type { OrganizationMember } from "@zhivago/shared";
import styles from "./LeadControls.module.css";

export function AssignLeadSelect({
  leadId,
  currentBrokerMemberId,
  brokers,
}: {
  leadId: string;
  currentBrokerMemberId: string | null;
  brokers: OrganizationMember[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useActionState(assignLeadAction, undefined);

  return (
    <form ref={formRef} action={formAction} className={styles.assignForm}>
      <input type="hidden" name="leadId" value={leadId} />
      <select
        name="brokerMemberId"
        defaultValue={currentBrokerMemberId ?? ""}
        className={styles.select}
        onChange={() => formRef.current?.requestSubmit()}
      >
        <option value="" disabled>
          Não atribuído
        </option>
        {brokers.map((broker) => (
          <option key={broker.id} value={broker.id}>
            {broker.user?.name ?? broker.userId}
          </option>
        ))}
      </select>
      {state?.error && <p className={styles.error}>{state.error}</p>}
    </form>
  );
}
