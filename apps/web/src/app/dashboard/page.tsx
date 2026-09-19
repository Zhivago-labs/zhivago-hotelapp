import type { Metadata } from "next";
import { requireAuth } from "@/lib/session";
import { getMyStats, getMyListings, getReceivedBookings } from "@/lib/listings-api";
import { getMyOrganization } from "@/lib/organizations-api";
import { DashboardClientView } from "@/components/dashboard/DashboardClientView";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Meu Dashboard | Zhivago" };

type Props = { searchParams: Promise<{ page?: string; q?: string; tab?: string }> };

export default async function DashboardPage({ searchParams }: Props) {
  const { token, user } = await requireAuth("/dashboard");

  if (user.role === "ADMIN") {
    return (
      <main className={styles.main}>
        <p className={styles.restricted}>
          Administradores não têm dashboard de anunciante — use o Painel Admin.
        </p>
      </main>
    );
  }

  const { page: pageParam, q } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const search = q ?? "";

  const [stats, listings, receivedBookings, membership] = await Promise.all([
    getMyStats(token),
    getMyListings(token),
    getReceivedBookings(token, page, search),
    getMyOrganization(token),
  ]);

  const isAgency = user.accountType === "AGENCY";
  const showTeamLink = isAgency || membership !== null;
  const showPipelineLink = membership !== null;
  const canApproveOrgListings = membership?.role === "OWNER" || membership?.role === "ADMIN";

  return (
    <main className={styles.main}>
      <DashboardClientView
        user={user}
        isAgency={isAgency}
        showTeamLink={showTeamLink}
        showPipelineLink={showPipelineLink}
        canApproveOrgListings={canApproveOrgListings}
        stats={stats}
        listings={listings}
        receivedBookings={receivedBookings}
        search={search}
        page={page}
      />
    </main>
  );
}
