import styles from "./LeadsKanbanMock.module.css";

type SlaKind = "ok" | "warn" | "bad" | "neutral";

interface KanbanCard {
  name: string;
  sla: SlaKind;
  label: string;
}

interface KanbanColumn {
  title: string;
  count: number;
  cards: KanbanCard[];
}

// Ilustrativo — mesma estrutura de status/SLA do CRM real (ver shared/index.ts:
// LeadStatus, SlaStatus), usado aqui só como mockup visual da landing page.
const COLUMNS: KanbanColumn[] = [
  {
    title: "Novo",
    count: 3,
    cards: [
      { name: "Marina Costa", sla: "neutral", label: "Sem corretor" },
      { name: "Diego Alves", sla: "ok", label: "No prazo" },
    ],
  },
  { title: "Contatado", count: 2, cards: [{ name: "Renata Lima", sla: "ok", label: "No prazo" }] },
  { title: "Qualificado", count: 2, cards: [{ name: "João Pereira", sla: "warn", label: "Em risco" }] },
  { title: "Visita agendada", count: 1, cards: [{ name: "Fábio Nunes", sla: "ok", label: "No prazo" }] },
  { title: "Proposta", count: 1, cards: [{ name: "Aline Souza", sla: "bad", label: "Atrasado" }] },
  { title: "Negociação", count: 1, cards: [{ name: "Carlos Reis", sla: "ok", label: "No prazo" }] },
];

const LEGEND: { color: string; label: string }[] = [
  { color: "#2f9e6a", label: "No prazo" },
  { color: "#d98a1f", label: "Em risco" },
  { color: "#e5484d", label: "Atrasado" },
  { color: "#7c8794", label: "Sem corretor" },
];

export function LeadsKanbanMock() {
  return (
    <>
      <div className={styles.kanban}>
        {COLUMNS.map((column) => (
          <div key={column.title} className={styles.kcol}>
            <div className={styles.kcolTitle}>
              {column.title} <span className={styles.n}>{column.count}</span>
            </div>
            {column.cards.map((card) => (
              <div key={card.name} className={styles.kcard}>
                <div className={styles.kcardName}>{card.name}</div>
                <span className={`${styles.sla} ${styles[card.sla]}`}>
                  <span className={styles.d} />
                  {card.label}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className={styles.kanbanLegend}>
        {LEGEND.map((item) => (
          <span key={item.label}>
            <span className={styles.legendDot} style={{ background: item.color }} />
            {item.label}
          </span>
        ))}
      </div>
    </>
  );
}
