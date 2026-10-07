import Link from "next/link";
import shared from "./shared.module.css";
import styles from "./ListYourPropertySection.module.css";

const STEPS = [
  { title: "Cadastre", text: "Fotos, preço e as características do imóvel." },
  { title: "Publique", text: "Depois de aprovado, o anúncio aparece na busca." },
  { title: "Receba interessados", text: "As conversas chegam direto nas suas mensagens." },
];

export function ListYourPropertySection() {
  return (
    <section className={styles.section} id="anunciar">
      <div className={shared.wrap}>
        <div className={styles.top}>
          <div className={styles.copy}>
            <div className={shared.sectionKicker}>Para proprietários</div>
            <h2 className={shared.sectionTitle}>Tem um imóvel para anunciar?</h2>
            <p className={shared.sectionSub}>
              Publique seu imóvel e comece a receber interessados pelo Zhivago.
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
