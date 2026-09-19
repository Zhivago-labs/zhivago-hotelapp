import Link from "next/link";
import shared from "./shared.module.css";
import styles from "./CrmSection.module.css";
import { LeadsKanbanMock } from "./LeadsKanbanMock";
import { MetricsCardMock } from "./MetricsCardMock";

const CRM_FEATURES = [
  {
    title: "Distribuição de leads",
    text: "Manual ou round-robin — a organização escolhe como cada novo lead é atribuído à equipe.",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="18" cy="6" r="3" />
        <circle cx="6" cy="18" r="3" />
        <path d="M9 18h6a3 3 0 003-3v-1M15 6H9a3 3 0 00-3 3v1" />
      </svg>
    ),
  },
  {
    title: "Histórico de interações",
    text: "Ligação, WhatsApp, e-mail, nota ou visita: cada contato fica registrado na linha do tempo do lead.",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 8v5l3 2" />
        <circle cx="12" cy="12" r="9" />
      </svg>
    ),
  },
  {
    title: "Métricas por corretor",
    text: "Taxa de conversão, tempo médio de resposta e leads ganhos, por pessoa e por período.",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 3v18h18" />
        <path d="M7 15l4-5 3 3 5-7" />
      </svg>
    ),
  },
];

const ROLES = [
  { name: "Proprietário", desc: "Controle total da organização" },
  { name: "Administrador", desc: "Gerencia equipe, anúncios e configurações" },
  { name: "Gerente", desc: "Acompanha leads e métricas da equipe" },
  { name: "Corretor", desc: "Atende leads atribuídos e agenda visitas" },
  { name: "Assistente", desc: "Apoio operacional, acesso restrito" },
];

export function CrmSection() {
  return (
    <section className={styles.dark} id="crm">
      <div className={styles.section}>
        <div className={shared.wrap}>
          <div className={shared.sectionHead}>
            <div className={shared.sectionKickerDark}>Para imobiliárias</div>
            <h2 className={`${shared.sectionTitle} ${styles.titleOnDark}`}>
              O CRM da sua imobiliária, dentro do Zhivago
            </h2>
            <p className={shared.sectionSubDark}>
              Cada conversa iniciada num anúncio da organização vira um lead, e percorre o funil até o
              fechamento.
            </p>
          </div>

          <LeadsKanbanMock />

          <div className={styles.crmFeatGrid}>
            {CRM_FEATURES.map((feature) => (
              <div key={feature.title} className={styles.crmFeatCell}>
                <div className={styles.featIcon}>{feature.icon}</div>
                <div className={styles.featTitle}>{feature.title}</div>
                <div className={styles.featText}>{feature.text}</div>
              </div>
            ))}
          </div>

          <div className={styles.teamBlock}>
            <div>
              <h3 className={styles.teamTitle}>Equipe com papéis definidos</h3>
              <p className={styles.teamText}>
                Convide corretores e controle o nível de acesso de cada um, do dono da conta ao
                assistente operacional.
              </p>
              <div className={styles.roleList}>
                {ROLES.map((role) => (
                  <div key={role.name} className={styles.roleRow}>
                    <div>
                      <div className={styles.roleName}>{role.name}</div>
                      <div className={styles.roleDesc}>{role.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <MetricsCardMock />
          </div>

          <div className={styles.crmCta}>
            <Link href="/cadastro" className={shared.btnLight}>
              Conhecer o Zhivago para imobiliárias
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
