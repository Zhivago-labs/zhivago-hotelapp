import { broadcastNotificationAction } from "@/lib/actions/admin";
import { ActionForm } from "@/components/ActionForm";
import styles from "./BroadcastForm.module.css";

export function BroadcastForm() {
  return (
    <ActionForm action={broadcastNotificationAction} className={styles.form}>
      <label className={styles.label} htmlFor="broadcast-title">
        Título
      </label>
      <input id="broadcast-title" name="title" type="text" className={styles.input} required maxLength={80} />

      <label className={styles.label} htmlFor="broadcast-message">
        Mensagem
      </label>
      <textarea id="broadcast-message" name="message" className={styles.textarea} required maxLength={500} />

      <div className={styles.radioRow}>
        <label>
          <input type="radio" name="targetStatus" value="ACTIVE" defaultChecked /> Usuários ativos
        </label>
        <label>
          <input type="radio" name="targetStatus" value="ALL" /> Todos os usuários
        </label>
      </div>

      <button type="submit" className={styles.submit}>
        Enviar notificação
      </button>
    </ActionForm>
  );
}
