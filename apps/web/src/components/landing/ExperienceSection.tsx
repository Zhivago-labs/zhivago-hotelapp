import Link from "next/link";
import shared from "./shared.module.css";
import styles from "./ExperienceSection.module.css";

const MODALITIES = [
  {
    title: "Temporada",
    subtitle: "Diárias flexíveis",
    desc: "Reserve por data de entrada e saída. Ideal para estadias de férias ou temporadas de trabalho remoto, com aprovação prévia do anfitrião.",
  },
  {
    title: "Mensal",
    subtitle: "Contratos recorrentes",
    desc: "Aluguel contínuo sem exigências burocráticas descabidas. Condições e termos combinados diretamente no chat com o proprietário.",
  },
  {
    title: "Compra e Venda",
    subtitle: "Aquisição patrimonial",
    desc: "Agende visitas presenciais, tire dúvidas sobre documentação e avance para a proposta com corretores devidamente credenciados.",
  },
];

export function ExperienceSection({ featuredImage }: { featuredImage: string | null }) {
  return (
    <section className={styles.section} id="experiencia">
      <div className={shared.wrap}>
        {/* Cabeçalho */}
        <div className={styles.header}>
          <div className={styles.kicker}>Modelo de Operação</div>
          <h2 className={styles.title}>Três modalidades de negociação, uma só plataforma.</h2>
          <p className={styles.sub}>
            O Zhivago simplifica a ponte entre quem busca e quem tem o imóvel.
            A modalidade determina o fluxo; a transparência na negociação permanece a mesma.
          </p>
        </div>

        {/* Tabela/Grid das Modalidades */}
        <div className={styles.modalitiesGrid}>
          {MODALITIES.map((item, idx) => (
            <div key={item.title} className={styles.modalityCard}>
              <div className={styles.modalityNumber}>0{idx + 1}</div>
              <div className={styles.modalityHeader}>
                <h3 className={styles.modalityTitle}>{item.title}</h3>
                <span className={styles.modalitySub}>{item.subtitle}</span>
              </div>
              <p className={styles.modalityDesc}>{item.desc}</p>
            </div>
          ))}
        </div>

        {/* Demonstração Real do Chat Integrado */}
        <div className={styles.chatModule}>
          <div className={styles.chatTextCol}>
            <div className={styles.kicker}>Comunicação Nativa</div>
            <h3 className={styles.chatHeading}>Fale diretamente com quem decide, sem intermediários ocultos.</h3>
            <p className={styles.chatParagraph}>
              Todas as dúvidas sobre o imóvel, condomínio, IPTU ou datas de visita são esclarecidas
              no chat integrado. Cada conversa fica arquivada com histórico de propostas e confirmações.
            </p>

            <div className={styles.featurePoints}>
              <div className={styles.point}>
                <strong>Sem vazamento de dados:</strong> você não precisa expor seu telefone antes de ter certeza sobre o imóvel.
              </div>
              <div className={styles.point}>
                <strong>Notificações em tempo real:</strong> avisos imediatos quando o proprietário ou corretor responde sua mensagem.
              </div>
              <div className={styles.point}>
                <strong>Histórico auditado:</strong> termos acordados no chat permanecem salvos para segurança de ambas as partes.
              </div>
            </div>

            <div className={styles.chatActionWrap}>
              <Link href="/imoveis" className={styles.btnExplore}>
                Explorar catálogo de imóveis &rarr;
              </Link>
            </div>
          </div>

          <div className={styles.chatPreviewCol}>
            <div className={styles.chatWindow}>
              <div className={styles.windowHeader}>
                <div className={styles.windowUser}>
                  <div className={styles.avatar}>AP</div>
                  <div>
                    <div className={styles.userName}>Ana Paula Ribeiro</div>
                    <div className={styles.userStatus}>Corretora credenciada &bull; Responde rápido</div>
                  </div>
                </div>
                <span className={styles.listingTag}>Apto Jardins</span>
              </div>

              <div className={styles.windowMessages}>
                <div className={styles.msgIn}>
                  <p>Boa tarde! Vi seu interesse no apartamento de 2 quartos em Moema. Ele está disponível tanto para visita presencial quanto para tour guiado por vídeo.</p>
                  <span className={styles.msgTime}>14:28</span>
                </div>

                <div className={styles.msgOut}>
                  <p>Boa tarde, Ana Paula! Gostaria de saber se o valor do condomínio já inclui a taxa de água e se a vaga de garagem é fixa.</p>
                  <span className={styles.msgTime}>14:31</span>
                </div>

                <div className={styles.msgIn}>
                  <p>Sim, a água está inclusa e a vaga é livre e coberta. Posso agendar sua visita para amanhã às 15h?</p>
                  <span className={styles.msgTime}>14:33</span>
                </div>
              </div>

              <div className={styles.windowInputMock}>
                <span>Escreva sua mensagem...</span>
                <span className={styles.sendIcon}>&rarr;</span>
              </div>
            </div>
          </div>
        </div>

      </div>
    </section>
  );
}
