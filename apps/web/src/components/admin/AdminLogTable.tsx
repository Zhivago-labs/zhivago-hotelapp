import type { AdminActionLog } from "@/lib/admin-api";
import styles from "./AdminLogTable.module.css";

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("pt-BR");
}

export function AdminLogTable({ logs }: { logs: AdminActionLog[] }) {
  return (
    <div className={styles.tableWrapper}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Quando</th>
            <th>Admin</th>
            <th>Ação</th>
            <th>Alvo</th>
            <th>Motivo / detalhes</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => (
            <tr key={log.id}>
              <td>{formatDateTime(log.createdAt)}</td>
              <td>{log.admin.name}</td>
              <td>
                <span className={styles.actionBadge}>{log.action}</span>
              </td>
              <td>
                {log.targetType}
                {log.targetId ? ` · ${log.targetId.slice(0, 8)}…` : ""}
              </td>
              <td className={styles.reason}>
                {log.reason ?? (log.metadata ? JSON.stringify(log.metadata) : "—")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
