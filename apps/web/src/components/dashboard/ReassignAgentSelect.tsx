"use client";

import { useActionState, useRef } from "react";
import { reassignListingAgentAction } from "@/lib/actions/organizations";
import styles from "./TeamSection.module.css";
import type { OrganizationMember } from "@zhivago/shared";

export function ReassignAgentSelect({
  listingId,
  currentAgentId,
  members,
}: {
  listingId: string;
  currentAgentId: string | null;
  members: OrganizationMember[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useActionState(reassignListingAgentAction, undefined);

  return (
    <form ref={formRef} action={formAction} className={styles.agentSelectRow}>
      <input type="hidden" name="id" value={listingId} />
      Corretor:
      <select
        name="agentId"
        defaultValue={currentAgentId ?? ""}
        className={styles.agentSelect}
        onChange={() => formRef.current?.requestSubmit()}
      >
        {members.map((member) => (
          <option key={member.userId} value={member.userId}>
            {member.user?.name ?? member.userId}
          </option>
        ))}
      </select>
      {state?.error && <p className={styles.agentSelectError}>{state.error}</p>}
    </form>
  );
}
