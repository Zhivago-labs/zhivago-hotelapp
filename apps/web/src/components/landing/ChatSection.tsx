import Link from "next/link";
import shared from "./shared.module.css";
import styles from "./ChatSection.module.css";

export function ChatSection() {
  return (
    <section className={styles.section} aria-labelledby="chat-title">
      <div className={`${shared.wrap} ${styles.inner}`}>
        <div className={styles.copy}>
          <h2 id="chat-title" className={shared.sectionTitle}>
            Negocie pelo Zhivago
          </h2>
          <p className={shared.sectionSub}>
            Tire dúvidas, combine visitas e mantenha a conversa organizada em um só lugar. Se quiser, envie uma
            proposta de valor pelo próprio chat.
          </p>
          <Link href="/imoveis" className={shared.btnSecondary}>
            Encontrar um imóvel
          </Link>
        </div>

        {/* Mockup ilustrativo da conversa — não representa uma conversa real. */}
        <div className={styles.mock} role="img" aria-label="Exemplo de conversa entre interessado e anunciante no chat">
          <div className={styles.mockHeader}>
            <span className={styles.avatar} aria-hidden="true">A</span>
            <div>
              <div className={styles.mockName}>Anunciante</div>
              <div className={styles.mockListing}>Apartamento 2 quartos</div>
            </div>
          </div>
          <div className={styles.messages} aria-hidden="true">
            <p className={styles.msgOut}>Oi! O apartamento ainda está disponível? Consigo visitar no sábado?</p>
            <p className={styles.msgIn}>Está sim! Sábado às 10h fica bom para você?</p>
            <div className={styles.offer}>
              <span className={styles.offerLabel}>Proposta enviada</span>
              <strong>R$ 2.300/mês</strong>
              <span className={styles.offerStatus}>Aguardando resposta</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
