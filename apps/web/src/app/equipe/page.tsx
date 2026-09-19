import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { requireAuth } from "@/lib/session";
import {
  getMyOrganization,
  getOrganizationListings,
  getMyAssignedListings,
  getMyPendingInvites,
  getOrganizationInvites,
} from "@/lib/organizations-api";
import { TeamSection } from "@/components/dashboard/TeamSection";
import { PendingInviteCard } from "@/components/dashboard/PendingInviteCard";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Equipe" };

const MANAGE_ROLES = ["OWNER", "ADMIN"];
const ORG_WIDE_VIEW_ROLES = ["OWNER", "ADMIN", "MANAGER", "ASSISTANT"];

export default async function EquipePage() {
  const { token, user } = await requireAuth("/equipe");
  const isAgency = user.accountType === "AGENCY";

  const [membership, myInvites] = await Promise.all([
    getMyOrganization(token),
    getMyPendingInvites(token),
  ]);

  if (!membership) {
    return (
      <main className={styles.main}>
        <Link href={user.role === "ADMIN" ? "/imoveis" : "/dashboard"} className={styles.backLink}>
          <ArrowLeft size={15} />
          {user.role === "ADMIN" ? "Voltar aos imóveis" : "Voltar ao dashboard"}
        </Link>
        <h1 className={styles.title}>Equipe</h1>

        {myInvites.length > 0 && (
          <div className={styles.invitesList}>
            {myInvites.map((invite) => (
              <PendingInviteCard key={invite.id} invite={invite} />
            ))}
          </div>
        )}

        {isAgency ? (
          <>
            <p className={styles.subtitle}>
              Crie uma organização para adicionar corretores e distribuir seus imóveis entre eles.
            </p>
            <TeamSection
              isAgency={isAgency}
              membership={null}
              canManageTeam={false}
              currentUserId={user.id}
              organizationListings={[]}
              assignedListings={[]}
              pendingInvites={[]}
            />
          </>
        ) : myInvites.length === 0 ? (
          <p className={styles.restricted}>Criar uma organização é exclusivo para contas Imobiliária.</p>
        ) : null}
      </main>
    );
  }

  const canManageTeam = MANAGE_ROLES.includes(membership.role);
  const hasOrgWideView = ORG_WIDE_VIEW_ROLES.includes(membership.role);

  const [organizationListings, assignedListings, pendingInvites] = await Promise.all([
    hasOrgWideView ? getOrganizationListings(token) : Promise.resolve([]),
    !hasOrgWideView ? getMyAssignedListings(token) : Promise.resolve([]),
    canManageTeam ? getOrganizationInvites(token) : Promise.resolve([]),
  ]);

  return (
    <main className={styles.main}>
      <Link href={user.role === "ADMIN" ? "/imoveis" : "/dashboard"} className={styles.backLink}>
        <ArrowLeft size={15} />
        {user.role === "ADMIN" ? "Voltar aos imóveis" : "Voltar ao dashboard"}
      </Link>
      <h1 className={styles.title}>Equipe</h1>
      <p className={styles.subtitle}>
        Gerencie os membros da sua organização e os imóveis atribuídos a cada corretor.
      </p>

      <TeamSection
        isAgency={isAgency}
        membership={membership}
        canManageTeam={canManageTeam}
        currentUserId={user.id}
        organizationListings={organizationListings}
        assignedListings={assignedListings}
        pendingInvites={pendingInvites}
      />
    </main>
  );
}
