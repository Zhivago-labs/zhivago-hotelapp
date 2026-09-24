"use client";

import { useState } from "react";
import { LeadsKanbanMock } from "./LeadsKanbanMock";
import { MetricsCardMock } from "./MetricsCardMock";
import styles from "./CrmInteractiveShowcase.module.css";

const ROLES = [
  { role: "Proprietário", access: "Total", desc: "Acesso administrativo completo, faturamento e configurações de conta." },
  { role: "Administrador", access: "Gestão", desc: "Gerencia membros da equipe, regras de moderação e integrações." },
  { role: "Gerente", access: "Supervisão", desc: "Acompanha desempenho da equipe, redistribui leads e monitora metas." },
  { role: "Corretor", access: "Operação", desc: "Atende leads atribuídos, registra notas de visita e atualiza propostas." },
  { role: "Assistente", access: "Suporte", desc: "Auxilia no cadastro de imóveis com acesso restrito a dados dos clientes." },
];

export function CrmInteractiveShowcase() {
  const [activeTab, setActiveTab] = useState<"kanban" | "distribution" | "team">("kanban");

  return (
    <div className={styles.showcase}>
      {/* Barra de Abas do CRM */}
      <div className={styles.tabNav} role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "kanban"}
          className={`${styles.tabBtn} ${activeTab === "kanban" ? styles.tabBtnActive : ""}`}
          onClick={() => setActiveTab("kanban")}
        >
          Funil de Oportunidades
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "distribution"}
          className={`${styles.tabBtn} ${activeTab === "distribution" ? styles.tabBtnActive : ""}`}
          onClick={() => setActiveTab("distribution")}
        >
          Distribuição de Leads
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "team"}
          className={`${styles.tabBtn} ${activeTab === "team" ? styles.tabBtnActive : ""}`}
          onClick={() => setActiveTab("team")}
        >
          Equipe e Permissões
        </button>
      </div>

      {/* Painéis */}
      <div className={styles.tabContent}>
        {activeTab === "kanban" && (
          <div className={styles.tabPane}>
            <div className={styles.paneHead}>
              <div>
                <h4 className={styles.paneTitle}>Funil visual por estágio de negociação</h4>
                <p className={styles.paneSub}>
                  Cada lead originado nos anúncios entra com marcador de SLA e avança pelas etapas até o fechamento.
                </p>
              </div>
              <div className={styles.legend}>
                <span className={styles.legendItem}><span className={styles.dotOk} /> No prazo</span>
                <span className={styles.legendItem}><span className={styles.dotWarn} /> Em risco</span>
                <span className={styles.legendItem}><span className={styles.dotBad} /> Atrasado</span>
              </div>
            </div>
            <LeadsKanbanMock />
          </div>
        )}

        {activeTab === "distribution" && (
          <div className={styles.tabPane}>
            <div className={styles.paneHead}>
              <div>
                <h4 className={styles.paneTitle}>Regras de atribuição de contatos</h4>
                <p className={styles.paneSub}>
                  Evite que potenciais clientes fiquem sem atendimento imediato. Defina regras manuais ou rotação automática entre corretores disponíveis.
                </p>
              </div>
            </div>

            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Corretor</th>
                    <th>Especialidade</th>
                    <th>Leads em Atendimento</th>
                    <th>Tempo Médio</th>
                    <th>Status da Fila</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className={styles.strongText}>Carolina Silva</td>
                    <td>Zona Sul (Apartamentos)</td>
                    <td>5 leads ativos</td>
                    <td>6 minutos</td>
                    <td><span className={styles.badgeActive}>Atribuído agora</span></td>
                  </tr>
                  <tr>
                    <td className={styles.strongText}>Rodrigo Azevedo</td>
                    <td>Casas e Condomínios</td>
                    <td>6 leads ativos</td>
                    <td>9 minutos</td>
                    <td><span className={styles.badgeNext}>Próximo na fila</span></td>
                  </tr>
                  <tr>
                    <td className={styles.strongText}>Larissa Nogueira</td>
                    <td>Comercial e Vendas</td>
                    <td>6 leads ativos</td>
                    <td>11 minutos</td>
                    <td><span className={styles.badgeIdle}>Disponível</span></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === "team" && (
          <div className={styles.tabPane}>
            <div className={styles.teamSplit}>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Papel na Organização</th>
                      <th>Nível</th>
                      <th>Permissões Atribuídas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ROLES.map((r) => (
                      <tr key={r.role}>
                        <td className={styles.strongText}>{r.role}</td>
                        <td><span className={styles.badgeRole}>{r.access}</span></td>
                        <td className={styles.descCol}>{r.desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className={styles.metricsBox}>
                <MetricsCardMock />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
