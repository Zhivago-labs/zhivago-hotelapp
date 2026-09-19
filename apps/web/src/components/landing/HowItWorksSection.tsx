import shared from "./shared.module.css";
import styles from "./HowItWorksSection.module.css";

const STEPS = [
  {
    title: "Descubra",
    text: "Explore imóveis que combinam com o que você procura, com busca e filtros por cidade, preço e tipo.",
  },
  {
    title: "Converse",
    text: "Fale direto com a pessoa ou a imobiliária responsável pelo imóvel, sem intermediário.",
  },
  {
    title: "Avance",
    text: "Continue a conversa, negocie e dê o próximo passo — seja reservar, alugar ou comprar.",
  },
];

export function HowItWorksSection() {
  return (
    <section className={styles.section} id="como-funciona">
      <div className={shared.wrap}>
        <div className={shared.sectionHead}>
          <div className={shared.sectionKicker}>Como funciona</div>
          <h2 className={shared.sectionTitle}>Do imóvel certo à conversa certa</h2>
        </div>

        <div className={styles.steps}>
          {STEPS.map((step, index) => (
            <div key={step.title} className={styles.step}>
              <div className={styles.num}>{String(index + 1).padStart(2, "0")}</div>
              <h3 className={styles.title}>{step.title}</h3>
              <p className={styles.text}>{step.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
