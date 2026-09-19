import { getAdminRevenue } from "@/lib/admin-api";
import { LineChart } from "@/components/dashboard/LineChart";
import styles from "@/app/admin/page.module.css";

function monthLabel(monthKey: string): string {
  const [year, month] = monthKey.split("-");
  return `${month}/${year.slice(2)}`;
}

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

export async function RevenueView({ token }: { token: string }) {
  const revenue = await getAdminRevenue(token);

  const months = Object.keys(revenue.monthly).sort();
  const totalData = months.length
    ? months.map((m) => ({ label: monthLabel(m), value: revenue.monthly[m]!.rental + revenue.monthly[m]!.sales }))
    : [{ label: "Sem dados", value: 0 }];

  return (
    <>
      <p className={styles.empty} style={{ marginBottom: 24 }}>
        Volume transacionado pela plataforma (GMV) — reservas confirmadas de aluguel + propostas
        aceitas de venda. O sistema não cobra comissão hoje, então isso não é lucro líquido, é
        quanto dinheiro passou pelos anúncios.
      </p>

      <div className={styles.statsGrid}>
        <div className={styles.statTile}>
          <p className={styles.statValue}>{formatCurrency(revenue.totalRentalRevenue)}</p>
          <p className={styles.statLabel}>Aluguel (6 meses)</p>
        </div>
        <div className={styles.statTile}>
          <p className={styles.statValue}>{formatCurrency(revenue.totalSalesRevenue)}</p>
          <p className={styles.statLabel}>Venda (6 meses)</p>
        </div>
        <div className={styles.statTile}>
          <p className={styles.statValue} style={{ color: "#22c55e" }}>
            {formatCurrency(revenue.totalRevenue)}
          </p>
          <p className={styles.statLabel}>Total (6 meses)</p>
        </div>
      </div>

      <div className={styles.chartsGrid}>
        <LineChart title="Volume transacionado por mês" data={totalData} color="#22c55e" format="currency" />
      </div>
    </>
  );
}
