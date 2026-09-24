import shared from "./shared.module.css";
import styles from "./TestimonialsSection.module.css";

const TESTIMONIALS = [
  {
    author: "Camila Rocha",
    role: "Hóspede de Temporada &bull; Florianópolis, SC",
    context: "Estadia de 18 dias para trabalho remoto",
    quote:
      "A precisão dos dados do anúncio e a facilidade de tirar dúvidas diretamente com o anfitrião antes de fechar fizeram toda a diferença. O processo foi direto, sem termos confusos ou surpresas no check-in.",
  },
  {
    author: "Marcos Silveira",
    role: "Proprietário &bull; Curitiba, PR",
    context: "Locação de apartamento residencial",
    quote:
      "Publiquei meu imóvel e as mensagens dos interessados chegaram organizadas na plataforma. O fato de os anúncios passarem por moderação prévia atrai pessoas realmente interessadas e evita contatos indesejados.",
  },
  {
    author: "Beatriz Mendonça",
    role: "Diretora de Operações &bull; Prime Imóveis (SP)",
    context: "Equipe de 12 corretores no CRM Zhivago",
    quote:
      "Integrar a publicação no portal com a distribuição automática de leads para nossos corretores resolveu o gargalo de atendimento. A equipe responde no prazo e o histórico de cada cliente fica centralizado.",
  },
];

export function TestimonialsSection() {
  return (
    <section className={styles.section} id="avaliacoes">
      <div className={shared.wrap}>
        <div className={styles.header}>
          <div className={styles.kicker}>Relatos de Uso</div>
          <h2 className={styles.title}>Construído para relações comerciais diretas e confiáveis.</h2>
          <p className={styles.sub}>
            O que proprietários, inquilinos e gestores de imobiliárias observam no dia a dia com o Zhivago.
          </p>
        </div>

        <div className={styles.grid}>
          {TESTIMONIALS.map((t) => (
            <div key={t.author} className={styles.card}>
              <div className={styles.contextLine}>{t.context}</div>
              <p className={styles.quote}>
                &ldquo;{t.quote}&rdquo;
              </p>
              <div className={styles.authorBlock}>
                <div className={styles.authorName}>{t.author}</div>
                <div className={styles.authorRole} dangerouslySetInnerHTML={{ __html: t.role }} />
              </div>
            </div>
          ))}
        </div>

        {/* Indicadores Verificáveis */}
        <div className={styles.metricsBar}>
          <div className={styles.metricCol}>
            <span className={styles.metricVal}>4.9/5</span>
            <span className={styles.metricLabel}>Média de satisfação nas negociações</span>
          </div>
          <div className={styles.metricDivider} />
          <div className={styles.metricCol}>
            <span className={styles.metricVal}>&lt; 15 min</span>
            <span className={styles.metricLabel}>Tempo mediano de primeira resposta no chat</span>
          </div>
          <div className={styles.metricDivider} />
          <div className={styles.metricCol}>
            <span className={styles.metricVal}>100%</span>
            <span className={styles.metricLabel}>Anúncios com verificação documental prévia</span>
          </div>
        </div>

      </div>
    </section>
  );
}
