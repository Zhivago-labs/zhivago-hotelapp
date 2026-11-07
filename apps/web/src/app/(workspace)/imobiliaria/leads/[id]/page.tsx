import Link from "next/link";
import type { Metadata } from "next";
import { requireAuth } from "@/lib/session";
import { getMyOrganization } from "@/lib/organizations-api";
import { getLeadDetail } from "@/lib/leads-api";
import { AssignLeadSelect } from "@/components/dashboard/AssignLeadSelect";
import { LeadStatusSelect } from "@/components/dashboard/LeadStatusSelect";
import { AddInteractionForm } from "@/components/dashboard/AddInteractionForm";
import { ScheduleVisitForm } from "@/components/dashboard/ScheduleVisitForm";
import { VisitStatusSelect } from "@/components/dashboard/VisitStatusSelect";
import { AddTaskForm } from "@/components/dashboard/AddTaskForm";
import { TaskCompleteToggle } from "@/components/dashboard/TaskCompleteToggle";
import { SlaBadge } from "@/components/dashboard/SlaBadge";
import styles from "./page.module.css";

type Params = { params: Promise<{ id: string }> };

export const metadata: Metadata = { title: "Detalhe do Lead" };

const MANAGE_ROLES = ["OWNER", "ADMIN", "MANAGER"];

const INTERACTION_LABELS: Record<string, string> = {
  PHONE_CALL: "Ligação",
  WHATSAPP: "WhatsApp",
  EMAIL: "E-mail",
  NOTE: "Nota",
  VISIT: "Visita",
  STATUS_CHANGE: "Mudança de status",
};

const VISIT_STATUS_LABELS: Record<string, string> = {
  SCHEDULED: "Agendada",
  CONFIRMED: "Confirmada",
  COMPLETED: "Concluída",
  CANCELLED: "Cancelada",
  NO_SHOW: "Não compareceu",
};

export default async function LeadDetailPage({ params }: Params) {
  const { id } = await params;
  const { token, user } = await requireAuth(`/imobiliaria/leads/${id}`);

  const lead = await getLeadDetail(token, id);
  if (!lead) {
    return (
      <main className={styles.main}>
        <p className={styles.restricted}>
          Este lead não existe ou você não tem permissão para vê-lo.
        </p>
      </main>
    );
  }

  const membership = await getMyOrganization(token);
  const canManage = !!membership && MANAGE_ROLES.includes(membership.role);
  const activeBrokers = membership
    ? membership.organization.members.filter(
        (member) => (member.role === "BROKER" || member.role === "MANAGER") && member.status === "ACTIVE"
      )
    : [];
  const currentAssignment = lead.assignmentHistory.find((a) => a.unassignedAt === null) ?? null;
  // ASSISTANT vê tudo (somente leitura); BROKER só mexe no que é seu — mesma regra do backend
  // (`resolveLeadAccess`), aqui só decide o que renderizar.
  const myMembershipId = membership?.organization.members.find((m) => m.userId === user.id)?.id ?? null;
  const isMyLead = !!myMembershipId && currentAssignment?.brokerId === myMembershipId;
  const canMutate = canManage || isMyLead;

  return (
    <main className={styles.main}>
      <Link href="/imobiliaria" className={styles.backLink}>
        ← Voltar ao pipeline
      </Link>

      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>{lead.user.name}</h1>
          <p className={styles.subtitle}>{lead.user.email}</p>
        </div>
        <div className={styles.headerActions}>
          <SlaBadge status={lead.slaStatus} />
          {canMutate ? (
            <LeadStatusSelect leadId={lead.id} currentStatus={lead.status} />
          ) : (
            <span className={styles.plain}>{lead.status}</span>
          )}
        </div>
      </div>

      <Link href={`/imovel/${lead.listing.id}`} className={styles.listingLink}>
        Ver imóvel: {lead.listing.name} →
      </Link>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Corretor responsável</h2>
        {canManage ? (
          <AssignLeadSelect
            leadId={lead.id}
            currentBrokerMemberId={currentAssignment?.brokerId ?? null}
            brokers={activeBrokers}
          />
        ) : (
          <p className={styles.plain}>{currentAssignment?.broker?.user?.name ?? "Não atribuído"}</p>
        )}
        {currentAssignment?.firstContactAt && (
          <p className={styles.responseTime}>
            Tempo de resposta:{" "}
            {(
              (new Date(currentAssignment.firstContactAt).getTime() -
                new Date(currentAssignment.assignedAt).getTime()) /
              3_600_000
            ).toFixed(1)}
            h
          </p>
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Tarefas / Próxima ação</h2>
        {canMutate && <AddTaskForm leadId={lead.id} />}

        <div className={styles.timeline}>
          {lead.tasks.length === 0 ? (
            <p className={styles.empty}>Nenhuma tarefa criada ainda.</p>
          ) : (
            lead.tasks.map((task) => (
              <div key={task.id} className={styles.timelineItem}>
                <span className={styles.timelineType} style={task.completedAt ? { textDecoration: "line-through" } : undefined}>
                  {task.title}
                </span>
                <span className={styles.timelineMeta}>
                  {task.dueAt ? new Date(task.dueAt).toLocaleString("pt-BR") : "Sem prazo"} ·{" "}
                  {task.completedAt ? "Concluída" : "Pendente"}
                </span>
                {canMutate && <TaskCompleteToggle taskId={task.id} leadId={lead.id} completed={!!task.completedAt} />}
              </div>
            ))
          )}
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Registrar contato</h2>
        {canMutate && <AddInteractionForm leadId={lead.id} />}

        <div className={styles.timeline}>
          {lead.interactions.length === 0 ? (
            <p className={styles.empty}>Nenhuma interação registrada ainda.</p>
          ) : (
            lead.interactions.map((interaction) => (
              <div key={interaction.id} className={styles.timelineItem}>
                <span className={styles.timelineType}>
                  {INTERACTION_LABELS[interaction.type] ?? interaction.type}
                </span>
                {interaction.content && <p className={styles.timelineContent}>{interaction.content}</p>}
                <span className={styles.timelineMeta}>
                  {interaction.member?.user?.name ?? "—"} ·{" "}
                  {new Date(interaction.createdAt).toLocaleString("pt-BR")}
                </span>
              </div>
            ))
          )}
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Visitas</h2>
        {canMutate && <ScheduleVisitForm leadId={lead.id} />}

        <div className={styles.timeline}>
          {lead.visits.length === 0 ? (
            <p className={styles.empty}>Nenhuma visita agendada ainda.</p>
          ) : (
            lead.visits.map((visit) => (
              <div key={visit.id} className={styles.timelineItem}>
                <span className={styles.timelineType}>
                  {new Date(visit.scheduledAt).toLocaleString("pt-BR")}
                </span>
                {visit.notes && <p className={styles.timelineContent}>{visit.notes}</p>}
                <span className={styles.timelineMeta}>
                  Responsável: {visit.broker?.user?.name ?? "—"} · {VISIT_STATUS_LABELS[visit.status]}
                </span>
                {canMutate && (
                  <VisitStatusSelect visitId={visit.id} leadId={lead.id} currentStatus={visit.status} />
                )}
              </div>
            ))
          )}
        </div>
      </section>
    </main>
  );
}
