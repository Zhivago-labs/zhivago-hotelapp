import { Building2, Receipt, Landmark, Repeat, CalendarClock, Sofa, PawPrint } from "lucide-react";
import type { Listing } from "@zhivago/shared";
import styles from "./HouseRules.module.css";

const GUARANTEE_LABELS: Record<string, string> = {
  CAUCAO: "Caução",
  SEGURO_FIANCA: "Seguro-fiança",
  FIADOR: "Fiador",
};

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function parseGuaranteeTypes(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Condições específicas de VENDA e ALUGUEL MENSAL (seções 66/67/83/84 da spec) — nunca mistura
 * elementos de hospedagem por diária (check-in/checkout/cancelamento ficam só em `HouseRules`,
 * que só é renderizado para DAILY_RENT). Só aparece quando há pelo menos um dado real a mostrar.
 */
export function CommercialConditionsPanel({ listing }: { listing: Listing }) {
  if (listing.operationType === "SALE") {
    const rows = [
      listing.condoFee != null && { icon: Building2, label: "Condomínio", value: `${formatCurrency(listing.condoFee)}/mês` },
      listing.iptuAnnual != null && { icon: Receipt, label: "IPTU", value: `${formatCurrency(listing.iptuAnnual)}/ano` },
      listing.acceptsFinancing && { icon: Landmark, label: "Financiamento", value: "Aceita financiamento" },
      listing.acceptsExchange && { icon: Repeat, label: "Permuta", value: "Aceita permuta" },
    ].filter((r): r is { icon: typeof Building2; label: string; value: string } => Boolean(r));

    if (rows.length === 0) return null;

    return (
      <section className={styles.container}>
        <h2 className={styles.title}>Condições da venda</h2>
        <div className={styles.grid}>
          <div className={styles.column}>
            {rows.map((row) => (
              <p className={styles.item} key={row.label}>
                <row.icon size={16} className={styles.itemIcon} />
                <span>
                  {row.label}: {row.value}
                </span>
              </p>
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (listing.operationType === "MONTHLY_RENT") {
    const guarantees = parseGuaranteeTypes(listing.guaranteeTypes);
    const rows = [
      listing.condoFee != null && { icon: Building2, label: "Condomínio", value: `${formatCurrency(listing.condoFee)}/mês` },
      listing.iptuMonthly != null && { icon: Receipt, label: "IPTU", value: `${formatCurrency(listing.iptuMonthly)}/mês` },
      listing.availableFrom && {
        icon: CalendarClock,
        label: "Disponível a partir de",
        value: new Date(listing.availableFrom).toLocaleDateString("pt-BR"),
      },
      listing.minimumLeaseMonths != null && {
        icon: CalendarClock,
        label: "Prazo mínimo",
        value: `${listing.minimumLeaseMonths} ${listing.minimumLeaseMonths === 1 ? "mês" : "meses"}`,
      },
      listing.isFurnished && { icon: Sofa, label: "Mobiliado", value: "Sim" },
      listing.allowPets != null && { icon: PawPrint, label: "Animais de estimação", value: listing.allowPets ? "Aceita" : "Não aceita" },
    ].filter((r): r is { icon: typeof Building2; label: string; value: string } => Boolean(r));

    if (rows.length === 0 && guarantees.length === 0) return null;

    return (
      <section className={styles.container}>
        <h2 className={styles.title}>Condições do aluguel mensal</h2>
        <div className={styles.grid}>
          <div className={styles.column}>
            {rows.map((row) => (
              <p className={styles.item} key={row.label}>
                <row.icon size={16} className={styles.itemIcon} />
                <span>
                  {row.label}: {row.value}
                </span>
              </p>
            ))}
            {guarantees.length > 0 && (
              <p className={styles.item}>
                <Landmark size={16} className={styles.itemIcon} />
                <span>Garantias aceitas: {guarantees.map((g) => GUARANTEE_LABELS[g] ?? g).join(", ")}</span>
              </p>
            )}
          </div>
        </div>
      </section>
    );
  }

  return null;
}
