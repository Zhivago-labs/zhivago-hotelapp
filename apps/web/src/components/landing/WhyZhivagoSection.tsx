import { BadgeCheck, ClipboardCheck, MessageCircle, KeyRound } from "lucide-react";
import shared from "./shared.module.css";
import styles from "./WhyZhivagoSection.module.css";

// Só o que o produto realmente faz hoje — ver moderação (listings/admin controllers) e o selo
// de verificação do ListingCard (apenas imobiliárias aprovadas).
const ITEMS = [
  {
    icon: ClipboardCheck,
    title: "Anúncios aprovados antes de publicar",
    text: "Nenhum anúncio entra direto no ar: cada um passa por aprovação antes de aparecer na busca.",
  },
  {
    icon: BadgeCheck,
    title: "Imobiliárias verificadas",
    text: "Imobiliárias aprovadas pela equipe Zhivago exibem o selo de verificação nos anúncios.",
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
