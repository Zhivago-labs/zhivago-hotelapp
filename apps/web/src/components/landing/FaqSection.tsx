"use client";

import { useState } from "react";
import shared from "./shared.module.css";
import styles from "./FaqSection.module.css";

const FAQ = [
  {
    q: "É grátis pra procurar ou anunciar um imóvel?",
    a: "Sim. Criar conta, buscar imóveis e publicar seu próprio anúncio não custa nada.",
  },
  {
    q: "Preciso pagar pra falar com quem anuncia?",
    a: "Não. A conversa acontece direto pelo chat da plataforma, sem custo e sem intermediário.",
  },
  {
    q: "Como funciona a reserva por temporada?",
    a: "Você escolhe as datas de check-in e check-out e envia um pedido de reserva; o anunciante confirma, recusa ou negocia pelo chat.",
  },
  {
    q: "Também dá pra alugar por mês, não só por temporada?",
    a: "Sim. Além da temporada (diária) e da venda, existe o aluguel mensal — negociado direto no chat com quem anuncia.",
  },
  {
    q: "Todo anúncio passa por revisão?",
    a: "Sim, cada anúncio é moderado antes de ficar público, pra manter o marketplace confiável pra quem procura e pra quem anuncia.",
  },
  {
    q: "Consigo salvar os imóveis que eu gostei?",
    a: "Sim. Use o botão de favoritos em qualquer anúncio e volte a eles quando quiser, sem perder o histórico de busca.",
  },
];

export function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section className={styles.section} id="faq">
      <div className={shared.wrap}>
        <div className={shared.sectionHead}>
          <div className={shared.sectionKicker}>Perguntas frequentes</div>
          <h2 className={shared.sectionTitle}>Antes de começar</h2>
        </div>

        <div className={styles.list}>
          {FAQ.map((item, index) => {
            const isOpen = openIndex === index;
            return (
              <div key={item.q} className={styles.item}>
                <button
                  type="button"
                  className={styles.question}
                  aria-expanded={isOpen}
                  onClick={() => setOpenIndex(isOpen ? null : index)}
                >
                  <span>{item.q}</span>
                  <svg
                    className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ""}`}
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>
                {isOpen && <p className={styles.answer}>{item.a}</p>}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
