"use client";

import { useActionState } from "react";
import { createOrganizationAction } from "@/lib/actions/organizations";
import styles from "./TeamSection.module.css";
import formStyles from "@/components/listings/ListingForm.module.css";

export function CreateOrganizationForm() {
  const [state, formAction, pending] = useActionState(createOrganizationAction, undefined);

  return (
    <form action={formAction}>
      {state?.error && <p className={formStyles.error}>{state.error}</p>}
      <div className={styles.inlineForm}>
        <input name="name" placeholder="Nome da organização" required className={styles.inlineInput} />
        <input name="document" placeholder="CNPJ" required className={styles.inlineInput} />
        <button type="submit" disabled={pending} className={styles.inlineButton}>
          {pending ? "Criando…" : "Criar organização"}
        </button>
      </div>
    </form>
  );
}
