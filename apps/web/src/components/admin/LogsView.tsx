import Link from "next/link";
import { getAdminLogs } from "@/lib/admin-api";
import { BroadcastForm } from "./BroadcastForm";
import { AdminLogTable } from "./AdminLogTable";
import styles from "@/app/admin/page.module.css";

export async function LogsView({ token, page }: { token: string; page: number }) {
  const { logs, totalPages } = await getAdminLogs(token, page);

  return (
    <>
      <BroadcastForm />

      {logs.length === 0 ? (
        <p className={styles.empty}>Nenhuma ação registrada ainda.</p>
      ) : (
        <AdminLogTable logs={logs} />
      )}

      {totalPages > 1 && (
        <div className={styles.pagination}>
          {page <= 1 ? (
            <span className={`${styles.pageLink} ${styles.pageLinkDisabled}`}>← Anterior</span>
          ) : (
            <Link href={`/admin?view=logs&page=${page - 1}`} className={styles.pageLink}>
              ← Anterior
            </Link>
          )}
          <span className={styles.pageInfo}>
            Página {page} de {totalPages}
          </span>
          {page >= totalPages ? (
            <span className={`${styles.pageLink} ${styles.pageLinkDisabled}`}>Próxima →</span>
          ) : (
            <Link href={`/admin?view=logs&page=${page + 1}`} className={styles.pageLink}>
              Próxima →
            </Link>
          )}
        </div>
      )}
    </>
  );
}
