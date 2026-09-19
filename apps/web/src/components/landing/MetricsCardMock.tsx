import styles from "./MetricsCardMock.module.css";

const BARS = [
  { height: 38, delay: 0.05 },
  { height: 52, delay: 0.1 },
  { height: 46, delay: 0.15 },
  { height: 68, delay: 0.2 },
  { height: 60, delay: 0.25 },
  { height: 82, delay: 0.3 },
  { height: 100, delay: 0.35 },
];

const STATS = [
  { value: "32%", label: "Taxa de conversão" },
  { value: "2,4h", label: "Resposta média" },
  { value: "91%", label: "SLA cumprido" },
];

// Ilustrativo — mesmas métricas que existem de verdade em OrganizationMetrics
// (ver shared/index.ts), representadas aqui só como mockup visual da landing.
export function MetricsCardMock() {
  return (
    <div className={styles.metricsCard}>
      <div className={styles.metricsHead}>
        <h4>Leads por mês</h4>
        <span>Painel de métricas</span>
      </div>
      <div className={styles.bars}>
        {BARS.map((bar, index) => (
          <div
            key={index}
            className={styles.bar}
            style={{ height: `${bar.height}%`, animationDelay: `${bar.delay}s` }}
          />
        ))}
      </div>
      <div className={styles.metricStats}>
        {STATS.map((stat) => (
          <div key={stat.label} className={styles.metricStat}>
            <div className={styles.v}>{stat.value}</div>
            <div className={styles.l}>{stat.label}</div>
          </div>
        ))}
      </div>
      <p className={styles.disclaimer}>Dados ilustrativos</p>
    </div>
  );
}
