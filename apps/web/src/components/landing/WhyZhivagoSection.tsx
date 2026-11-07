import { BadgeCheck, ClipboardCheck, MessageCircle, KeyRound } from "lucide-react";
import shared from "./shared.module.css";
import styles from "./WhyZhivagoSection.module.css";

// Só o que o produto realmente faz hoje — ver moderação (listings/admin controllers) e o selo
// de verificação do ListingCard (apenas imobiliárias aprovadas).
const ITEMS = [
  {
    icon: ClipboardCheck,
    title: "Publicação com regras claras",
    text: "Pessoas físicas publicam diretamente. Anúncios de imobiliárias passam pela aprovação da própria equipe.",
  },
  {
    icon: BadgeCheck,
    title: "Imobiliárias verificadas",
    text: "O selo identifica imobiliárias verificadas pela equipe Zhivago. Ele não garante a autenticidade de cada imóvel.",
  },
  {
    icon: MessageCircle,
    title: "Conversa direta com quem anuncia",
    text: "Tire dúvidas e combine visitas pelo chat, sem precisar trocar telefone antes.",
  },
  {
    icon: KeyRound,
    title: "Compra, aluguel e temporada",
    text: "Imóveis para morar, investir ou passar uns dias, tudo na mesma busca.",
  },
];

export function WhyZhivagoSection() {
  return (
    <section className={styles.section} aria-labelledby="why-title">
      <div className={shared.wrap}>
        <h2 id="why-title" className={shared.sectionTitle}>
          Por que procurar imóveis no Zhivago?
        </h2>
        <ul className={styles.grid}>
          {ITEMS.map(({ icon: Icon, title, text }) => (
            <li key={title} className={styles.item}>
              <Icon size={22} aria-hidden="true" className={styles.icon} />
              <h3 className={styles.title}>{title}</h3>
              <p className={styles.text}>{text}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
