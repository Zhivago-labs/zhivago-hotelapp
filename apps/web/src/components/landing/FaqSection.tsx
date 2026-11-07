"use client";

import { useState } from "react";
import shared from "./shared.module.css";
import styles from "./FaqSection.module.css";

const FAQ = [
  {
    q: "É grátis procurar imóveis?",
    a: "Sim. Buscar, ver os detalhes e salvar favoritos não custa nada e não exige conta. Anunciar também é gratuito.",
  },
  {
    q: "Preciso criar uma conta para entrar em contato?",
    a: "Sim. Para conversar com quem anuncia, pedir uma reserva ou enviar uma proposta, é preciso entrar. O cadastro é gratuito e pode ser feito com e-mail ou com sua conta Google.",
  },
  {
    q: "Como funciona o chat?",
    a: "Na página do imóvel, você abre uma conversa com quem anuncia. Ela fica salva nas suas mensagens, onde vocês tiram dúvidas, combinam visitas e trocam propostas de valor.",
  },
  {
    q: "Os anúncios são verificados?",
    a: "Pessoas físicas publicam diretamente; anúncios de imobiliárias são aprovados pela própria imobiliária. A verificação da imobiliária é separada dessa aprovação e não representa garantia de autenticidade ou segurança do imóvel.",
  },
  {
    q: "Posso anunciar meu imóvel?",
    a: "Sim. Crie sua conta, cadastre o imóvel com fotos, preço e características e publique. Anúncios de imobiliárias precisam de aprovação da própria equipe antes de aparecer na busca.",
  },
  {
    q: "Como funciona a reserva por temporada?",
    a: "Você escolhe as datas de entrada e saída e envia um pedido de reserva. Quem anuncia confirma, recusa ou negocia com você pelo chat.",
  },
];

export function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section className={styles.section} id="faq">
      <div className={shared.wrap}>
        <div className={shared.sectionHead}>
          <h2 className={shared.sectionTitle}>Perguntas frequentes</h2>
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
