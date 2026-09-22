import { ShieldCheck, MessageSquare } from "lucide-react";
import styles from "./HostCard.module.css";

interface Props {
  owner: {
    id: string;
    name: string;
    avatar: string | null;
    accountType?: string;
    companyName?: string | null;
    verified?: boolean;
  };
  isOrganization?: boolean;
}

/**
 * Seção 88/89 da spec: sem estatísticas fabricadas ("12 avaliações", "5,0 estrelas", "100% taxa
 * de resposta", "hospeda há 2 meses" etc.) e sem biografia genérica fixa. Só mostra o que é
 * verdadeiramente sabido: nome, avatar e selo de verificação real.
 */
export function HostCard({ owner, isOrganization = false }: Props) {
  const displayName = owner.companyName || owner.name;
  const avatarUrl =
    owner.avatar ??
    `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=f0f0f0`;

  return (
    <section className={styles.container}>
      <h2 className={styles.title}>{isOrganization ? "Sobre a imobiliária" : "Conheça o anunciante"}</h2>

      <div className={styles.profileCard}>
        <div className={styles.topRow}>
          <div className={styles.avatarWrap}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={avatarUrl} alt={displayName} className={styles.avatar} />
          </div>
          <div className={styles.hostDetails}>
            <h3 className={styles.hostName}>{displayName}</h3>
            {owner.verified && (
              <p className={styles.hostBadge}>
                <ShieldCheck size={16} style={{ color: "var(--accent)" }} />
                {isOrganization ? "Imobiliária verificada" : "Conta verificada"}
              </p>
            )}
          </div>
        </div>

        <div className={styles.contactInfo}>
          <div className={styles.contactItem}>
            <MessageSquare size={16} className={styles.contactIcon} />
            <span>Sempre utilize a plataforma Zhivago para pagamentos e mensagens seguras</span>
          </div>
        </div>
      </div>
    </section>
  );
}
