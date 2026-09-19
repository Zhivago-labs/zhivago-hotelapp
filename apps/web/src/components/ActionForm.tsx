"use client";

import { useActionState } from "react";
import styles from "./ActionForm.module.css";

type ActionState = { error: string } | undefined;
type Action = (prevState: ActionState, formData: FormData) => Promise<ActionState>;

/**
 * Wrapper fino em volta de `useActionState` pra Server Actions do tipo "botão de ação"
 * (aprovar, publicar, deletar…) que hoje só tinham `<form action={fn}>` puro e nenhum
 * jeito de mostrar erro — a request falhava e o botão simplesmente não fazia nada.
 */
export function ActionForm({
  action,
  className,
  children,
}: {
  action: Action;
  className?: string;
  children: React.ReactNode;
}) {
  const [state, formAction] = useActionState(action, undefined);

  return (
    <form action={formAction} className={className}>
      {children}
      {state?.error && <p className={styles.error}>{state.error}</p>}
    </form>
  );
}
