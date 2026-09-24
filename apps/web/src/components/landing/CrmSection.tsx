import Link from "next/link";
import shared from "./shared.module.css";
import styles from "./CrmSection.module.css";
import { CrmInteractiveShowcase } from "./CrmInteractiveShowcase";

const CRM_FEATURES = [
  {
    title: "Distribuição inteligente de leads",
    text: "Manual ou Round-Robin automático: garanta que nenhum lead fique sem atendimento imediato.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="18" cy="6" r="3" />
        <circle cx="6" cy="18" r="3" />
        <path d="M9 18h6a3 3 0 003-3v-1M15 6H9a3 3 0 00-3 3v1" />
      </svg>
    ),
  },
  {
    title: "Linha do tempo e histórico",
    text: "Ligação, WhatsApp, e-mail, notas internas ou visitas agendadas salvas na ficha do lead.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 8v5l3 2" />
        <circle cx="12" cy="12" r="9" />
      </svg>
    ),
  },
  {
    title: "Métricas e SLA por corretor",
    text: "Monitore tempo de resposta, taxa de conversão em visitas e fechamentos por membro do time.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 3v18h18" />
        <path d="M7 15l4-5 3 3 5-7" />
      </svg>
    ),
  },
];

export function CrmSection() {
  return (
    <section className={styles.dark} id="crm">
      <div className={styles.section}>
        <div className={shared.wrap}>
          <div className={shared.sectionHead}>
            <div className={shared.sectionKickerDark}>Zhivago para Imobiliárias &bull; CRM Integrado</div>
            <h2 className={`${shared.sectionTitle} ${styles.titleOnDark}`}>
              Acelere suas vendas sem precisar de um CRM externo
            </h2>
            <p className={shared.sectionSubDark}>
              Cada mensagem enviada por interessados nos anúncios da sua imobiliária se transforma
              automaticamente em um lead no seu funil de vendas.
            </p>
          </div>

          {/* Showcase com abas interativas */}
          <CrmInteractiveShowcase />

          {/* Destaques das Funcionalidades do CRM */}
          <div className={styles.crmFeatGrid}>
            {CRM_FEATURES.map((feature) => (
              <div key={feature.title} className={styles.crmFeatCell}>
                <div className={styles.featIcon}>{feature.icon}</div>
                <div className={styles.featTitle}>{feature.title}</div>
                <div className={styles.featText}>{feature.text}</div>
              </div>
            ))}
          </div>

          {/* Chamada para Ação no CRM */}
          <div className={styles.crmCta}>
            <div className={styles.crmCtaBox}>
              <div className={styles.crmCtaText}>
                <h3>Quer transformar os anúncios da sua imobiliária em máquinas de conversão?</h3>
                <p>Cadastre sua organização agora mesmo. Convide seus corretores e comece a operar hoje.</p>
              </div>
              <div className={styles.crmCtaBtns}>
                <Link href="/cadastro" className={shared.btnPrimary}>
                  Criar conta imobiliária grátis
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </Link>
                <Link href="/login" className={shared.btnLight}>
                  Já tenho conta &bull; Entrar
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
