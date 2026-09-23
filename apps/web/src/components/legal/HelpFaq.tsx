"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import styles from "./HelpFaq.module.css";

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
  {
    q: "Como recupero minha senha?",
    a: "Na tela de login, use o link \"Esqueci minha senha\" e siga as instruções enviadas para o seu e-mail.",
  },
  {
    q: "Como denuncio um anúncio ou uma conversa?",
    a: "Abra o anúncio ou a conversa e use a opção de denunciar/reportar. Nossa equipe de moderação analisa cada denúncia.",
  },
  {
    q: "Como excluo minha conta?",
    a: "Fale com o nosso suporte pelo e-mail abaixo e faremos a exclusão da sua conta e dos seus dados, conforme nossa Política de Privacidade.",
  },
];

export function HelpFaq() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
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
              <ChevronDown size={18} className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ""}`} />
            </button>
            {isOpen && <p className={styles.answer}>{item.a}</p>}
          </div>
        );
      })}
    </div>
  );
}
