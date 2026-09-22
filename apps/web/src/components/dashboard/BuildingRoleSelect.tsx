"use client";

import { useActionState, useRef } from "react";
import { setBuildingRoleAction } from "@/lib/actions/organizations";
import type { OrganizationMember } from "@zhivago/shared";
import formStyles from "@/components/listings/ListingForm.module.css";

/** Atribuir/transferir Lead Owner ou definir o backup do empreendimento (seção 74/75/17 da spec). */
export function BuildingRoleSelect({
  buildingId,
  field,
  currentMemberId,
  eligibleMembers,
}: {
  buildingId: string;
  field: "lead-owner" | "backup";
  currentMemberId: string | null;
  eligibleMembers: OrganizationMember[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useActionState(setBuildingRoleAction, undefined);

  return (
    <form ref={formRef} action={formAction}>
      <input type="hidden" name="id" value={buildingId} />
      <input type="hidden" name="field" value={field} />
      <select
        name="memberId"
        defaultValue={currentMemberId ?? ""}
        onChange={() => formRef.current?.requestSubmit()}
        style={{
          padding: "6px 10px",
          borderRadius: "8px",
          border: "1px solid var(--border)",
          fontSize: "13px",
          background: "var(--card-bg)",
          color: "var(--foreground)",
        }}
      >
        <option value="">Ninguém</option>
        {eligibleMembers.map((m) => (
          <option key={m.id} value={m.id}>
            {m.user?.name ?? "Membro"}
          </option>
        ))}
      </select>
      {state?.error && <p className={formStyles.error}>{state.error}</p>}
    </form>
  );
}
