import Link from "next/link";
import shared from "./shared.module.css";
import styles from "./ListYourPropertySection.module.css";

const STEPS = [
  { title: "Cadastre o imóvel", text: "Nome, fotos, preço, tipo e características do espaço." },
  { title: "Aguarde a moderação", text: "A equipe Zhivago revisa antes da publicação." },
  { title: "Receba interessados", text: "O imóvel aparece na busca e as conversas chegam no inbox." },
];

export function ListYourPropertySection() {
  return (
    <section className={styles.section} id="anunciar">
      <div className={shared.wrap}>
        <div className={styles.top}>
          <div className={styles.copy}>
            <div className={shared.sectionKicker}>Para proprietários e imobiliárias</div>
            <h2 className={shared.sectionTitle}>Tem um imóvel pra anunciar?</h2>
            <p className={shared.sectionSub}>
              Coloque seu imóvel na frente de quem está procurando o próximo lugar pra morar.
            </p>
          </div>
          <Link href="/anuncios/novo" className={shared.btnPrimary}>
            Anunciar imóvel
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </Link>
        </div>

        <div className={styles.steps}>
          {STEPS.map((step, index) => (
            <div key={step.title} className={styles.step}>
              <div className={styles.stepNum}>{index + 1}</div>
              <h4>{step.title}</h4>
              <p>{step.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
