import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { requireAuth } from "@/lib/session";
import { getMyPendingInvites } from "@/lib/organizations-api";
import { PendingInviteCard } from "@/components/dashboard/PendingInviteCard";
import styles from "../../page.module.css";

export const metadata: Metadata = { title: "Convite de organização" };

type Props = { params: Promise<{ token: string }> };

/**
 * Landing page do link de e-mail (`mail.ts`, sendOrganizationInviteEmail). Reaproveita
 * `GET /organizations/invites/me` (filtrado pelo e-mail da própria sessão) em vez de expor um
 * endpoint público por token — evita que qualquer um com o link veja e-mail/papel do convite
 * sem estar autenticado com a conta correta.
 */
export default async function InviteLandingPage({ params }: Props) {
  const { token: routeToken } = await params;
  const { token } = await requireAuth(`/equipe/convite/${routeToken}`);
  const invites = await getMyPendingInvites(token);
  const invite = invites.find((i) => i.token === routeToken);

  return (
    <main className={styles.main}>
      <Link href="/equipe" className={styles.backLink}>
        <ArrowLeft size={15} />
        Ir para Equipe
      </Link>
      <h1 className={styles.title}>Convite de organização</h1>

      {invite ? (
        <PendingInviteCard invite={invite} />
      ) : (
        <p className={styles.restricted}>
          Este convite não existe mais, já foi aceito/recusado, expirou, ou não pertence à conta com que
          você está logado.
        </p>
      )}
    </main>
  );
}
