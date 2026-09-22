"use client";

import { useActionState } from "react";
import { createOrganizationBuildingAction, type CreateBuildingState } from "@/lib/actions/organizations";
import styles from "./TeamSection.module.css";
import formStyles from "@/components/listings/ListingForm.module.css";

export function CreateBuildingForm() {
  const [state, formAction, pending] = useActionState<CreateBuildingState, FormData>(createOrganizationBuildingAction, undefined);

  return (
    <form action={formAction} className={styles.inlineForm}>
      <input type="text" name="name" placeholder="Nome do empreendimento" required className={styles.inlineInputWithIcon} />
      <input type="text" name="address" placeholder="Endereço (opcional)" className={styles.inlineInputWithIcon} />
      <button type="submit" disabled={pending} className={styles.primaryInlineButton}>
        {pending ? "Criando…" : "+ Novo empreendimento"}
      </button>
      {state && "error" in state && <p className={formStyles.error}>{state.error}</p>}
    </form>
  );
}
