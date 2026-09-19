import shared from "./shared.module.css";
import styles from "./ModalitiesSection.module.css";

const MODALITIES = [
  {
    title: "Temporada",
    text: "Reserve por data de check-in e check-out — ideal pra estadias curtas. O anunciante confirma o pedido antes da estadia.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="4" width="18" height="17" rx="2" />
        <path d="M3 9h18M8 2v4M16 2v4" />
      </svg>
    ),
  },
  {
    title: "Mensal",
    text: "Aluguel recorrente, negociado direto no chat com o proprietário ou a imobiliária — sem burocracia de reserva por data.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 9.5L12 3l9 6.5" />
        <path d="M5 10v10a1 1 0 001 1h4v-6h4v6h4a1 1 0 001-1V10" />
      </svg>
    ),
  },
  {
    title: "Venda",
    text: "Negocie valor e condições pelo chat com quem anuncia e avance direto pra fechar a compra do imóvel.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M20.4 14.5L16 10.1l-6.3 6.3-3.6-3.6" />
        <path d="M3.6 15.9V20h4.1" />
        <circle cx="18" cy="6" r="2.5" />
      </svg>
    ),
  },
];

export function ModalitiesSection() {
  return (
    <section className={styles.section} id="modalidades">
      <div className={shared.wrap}>
        <div className={shared.sectionHead}>
          <div className={shared.sectionKicker}>Três formas de fechar negócio</div>
          <h2 className={shared.sectionTitle}>Temporada, mensal ou venda — você escolhe</h2>
          <p className={shared.sectionSub}>
            Cada imóvel já nasce marcado com uma dessas modalidades — o que muda é só o fluxo depois que você
            encontra o que procura.
          </p>
        </div>

        <div className={styles.grid}>
          {MODALITIES.map((modality) => (
            <div key={modality.title} className={styles.cell}>
              <div className={styles.icon}>{modality.icon}</div>
              <div className={styles.title}>{modality.title}</div>
              <div className={styles.text}>{modality.text}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
