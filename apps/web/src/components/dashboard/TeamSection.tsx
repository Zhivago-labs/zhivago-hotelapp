import Link from "next/link";
import { BadgeCheck, Clock, Building2, Users, FileText, UserCheck, Home, Mail, UserPlus, ArrowRight } from "lucide-react";
import { CreateOrganizationForm } from "./CreateOrganizationForm";
import { InviteMemberForm } from "./InviteMemberForm";
import { CancelInviteButton } from "./CancelInviteButton";
import { ReassignAgentSelect } from "./ReassignAgentSelect";
import { RemoveMemberButton } from "./RemoveMemberButton";
import { OwnerListingCard } from "./OwnerListingCard";
import { LeadDistributionModeToggle } from "./LeadDistributionModeToggle";
import { ReceiveLeadsToggle } from "./ReceiveLeadsToggle";
import type { MyOrganization, OrganizationListing } from "@/lib/organizations-api";
import type { OwnedListing } from "@/lib/listings-api";
import type { OrganizationInvite } from "@zhivago/shared";
import styles from "./TeamSection.module.css";

const ROLE_LABELS: Record<string, string> = {
  OWNER: "Proprietário",
  ADMIN: "Administrador",
  MANAGER: "Gerente",
  BROKER: "Corretor",
  ASSISTANT: "Assistente",
};

const RECEIVES_LEADS_ROLES = ["BROKER", "MANAGER"];

export function TeamSection({
  isAgency,
  membership,
  canManageTeam,
  currentUserId,
  organizationListings,
  assignedListings,
  pendingInvites,
}: {
  isAgency: boolean;
  membership: MyOrganization | null;
  canManageTeam: boolean;
  currentUserId: string;
  organizationListings: OrganizationListing[];
  assignedListings: OwnedListing[];
  pendingInvites: OrganizationInvite[];
}) {
  if (!membership) {
    if (!isAgency) return null;

    return (
      <section className={styles.section}>
        <CreateOrganizationForm />
      </section>
    );
  }

  const { role, organization } = membership;
  const hasOrgWideView = role === "OWNER" || role === "MANAGER" || role === "ADMIN" || role === "ASSISTANT";
  const canManageDistribution = role === "OWNER" || role === "ADMIN";

  return (
    <div className={styles.container}>
      {/* Banner Principal da Organização */}
      <section className={styles.companyBanner}>
        <div className={styles.companyBannerHeader}>
          <div className={styles.companyTitleGroup}>
            <div className={styles.companyIconWrap}>
              <Building2 size={24} />
            </div>
            <div>
              <h2 className={styles.companyName}>{organization.name}</h2>
              <p className={styles.companyDocument}>
                <FileText size={13} className={styles.inlineIcon} />
                CNPJ: {organization.document}
              </p>
            </div>
          </div>

          <div className={styles.companyBadges}>
            {organization.verified ? (
              <span className={styles.verifiedBadge}>
                <BadgeCheck size={14} />
                Organização verificada
              </span>
            ) : (
              <span className={styles.pendingBadge}>
                <Clock size={14} />
                Aguardando verificação
              </span>
            )}
            <span className={styles.metaStatBadge}>
              <Users size={14} />
              {organization.members.length} {organization.members.length === 1 ? "Membro" : "Membros"}
            </span>
          </div>
        </div>
      </section>

      {/* Seção Membros da Equipe */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <h3 className={styles.sectionTitle}>
              <Users size={18} className={styles.titleIcon} />
              Membros da Equipe ({organization.members.length})
            </h3>
            <p className={styles.sectionSubtitle}>
              Corretores e gestores com acesso aos imóveis corporativos da organização.
            </p>
          </div>
        </div>

        <div className={styles.membersGrid}>
          {organization.members.map((member) => (
            <div key={member.id} className={styles.memberCard}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={
                  member.user?.avatar ??
                  `https://ui-avatars.com/api/?name=${encodeURIComponent(
                    member.user?.name ?? "Corretor"
                  )}&background=f0f0f0`
                }
                alt={member.user?.name ?? "Membro"}
                className={styles.memberAvatar}
              />
              <div className={styles.memberInfo}>
                <span className={styles.memberName}>{member.user?.name ?? member.userId}</span>
                <span className={styles.memberEmail}>{member.user?.email}</span>
              </div>
              <span
                className={`${styles.roleBadge} ${
                  member.role === "OWNER" ? styles.roleBadgeOwner : styles.roleBadgeAgent
                }`}
              >
                {ROLE_LABELS[member.role] ?? member.role}
              </span>
              {RECEIVES_LEADS_ROLES.includes(member.role) &&
                (canManageTeam || member.userId === currentUserId) && (
                  <ReceiveLeadsToggle userId={member.userId} receiveLeads={member.receiveLeads} />
                )}
              {canManageTeam && member.role !== "OWNER" && (
                <RemoveMemberButton userId={member.userId} name={member.user?.name ?? "este membro"} />
              )}
            </div>
          ))}
        </div>

        {canManageTeam && (
          <>
            <InviteMemberForm />

            {pendingInvites.length > 0 && (
              <div className={styles.pendingInvitesBox}>
                <p className={styles.pendingInvitesTitle}>
                  <Mail size={15} className={styles.inlineIcon} />
                  Convites pendentes ({pendingInvites.length})
                </p>
                <div className={styles.pendingInvitesList}>
                  {pendingInvites.map((invite) => (
                    <div key={invite.id} className={styles.pendingInviteRow}>
                      <span className={styles.pendingInviteEmail}>{invite.email}</span>
                      <span className={styles.pendingInviteRole}>{ROLE_LABELS[invite.role] ?? invite.role}</span>
                      <CancelInviteButton id={invite.id} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {/* Seção Imóveis */}
      {hasOrgWideView ? (
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <h3 className={styles.sectionTitle}>
                <Home size={18} className={styles.titleIcon} />
                Imóveis da Organização ({organizationListings.length})
              </h3>
              <p className={styles.sectionSubtitle}>
                Atribua ou altere o corretor responsável pela gestão e atendimento de cada imóvel.
              </p>
            </div>
          </div>

          {organizationListings.length === 0 ? (
            <div className={styles.emptyStateBox}>
              <p className={styles.empty}>Nenhum imóvel cadastrado no portfólio corporativo ainda.</p>
            </div>
          ) : (
            <div className={styles.listingsGrid}>
              {organizationListings.map((listing) => (
                <div key={listing.id} className={styles.listingCardWrap}>
                  <OwnerListingCard listing={listing} />
                  {canManageTeam && (
                    <ReassignAgentSelect
                      listingId={listing.id}
                      currentAgentId={listing.agent?.id ?? null}
                      members={organization.members}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      ) : (
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <h3 className={styles.sectionTitle}>
                <UserCheck size={18} className={styles.titleIcon} />
                Meus Imóveis Atribuídos ({assignedListings.length})
              </h3>
              <p className={styles.sectionSubtitle}>
                Imóveis da organização pelos quais você é o corretor responsável.
              </p>
            </div>
          </div>

          {assignedListings.length === 0 ? (
            <div className={styles.emptyStateBox}>
              <p className={styles.empty}>Nenhum imóvel atribuído a você no momento.</p>
            </div>
          ) : (
            <div className={styles.listingsGrid}>
              {assignedListings.map((listing) => (
                <OwnerListingCard key={listing.id} listing={listing} />
              ))}
            </div>
          )}
        </section>
      )}

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <h3 className={styles.sectionTitle}>
              <UserPlus size={18} className={styles.titleIcon} />
              Leads
            </h3>
            <p className={styles.sectionSubtitle}>
              Acompanhe conversas, atribuições, visitas e o funil completo no pipeline de leads.
            </p>
          </div>
        </div>

        <div className={styles.pipelineLinkRow}>
          <Link href="/imobiliaria" className={styles.pipelineLink}>
            Ver pipeline de leads
            <ArrowRight size={14} />
          </Link>
          {canManageDistribution && (
            <LeadDistributionModeToggle mode={organization.leadDistributionMode} />
          )}
        </div>
      </section>
    </div>
  );
}
