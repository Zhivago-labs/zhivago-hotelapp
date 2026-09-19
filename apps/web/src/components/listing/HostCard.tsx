import { Star, ShieldCheck, Clock, MessageSquare } from "lucide-react";
import styles from "./HostCard.module.css";

interface Props {
  owner: {
    id: string;
    name: string;
    avatar: string | null;
    accountType?: string;
    companyName?: string | null;
  };
}

export function HostCard({ owner }: Props) {
  const displayName = owner.companyName || owner.name;
  const avatarUrl =
    owner.avatar ??
    `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=f0f0f0`;

  return (
    <section className={styles.container}>
      <h2 className={styles.title}>Conheça seu anfitrião</h2>

      <div className={styles.profileCard}>
        <div className={styles.topRow}>
          <div className={styles.avatarWrap}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={avatarUrl} alt={displayName} className={styles.avatar} />
          </div>
          <div className={styles.hostDetails}>
            <h3 className={styles.hostName}>{displayName}</h3>
            <p className={styles.hostBadge}>
              <ShieldCheck size={16} style={{ color: "var(--accent)" }} />
              Anfitrião Verificado · Hospeda há 2 meses
            </p>
          </div>
        </div>

        <div className={styles.statsRow}>
          <div className={styles.statItem}>
            <span className={styles.statValue}>12</span>
            <span className={styles.statLabel}>Avaliações</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statValue}>
              5,0 <Star size={12} style={{ display: "inline", fill: "currentColor" }} />
            </span>
            <span className={styles.statLabel}>Classificação</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statValue}>100%</span>
            <span className={styles.statLabel}>Taxa de resposta</span>
          </div>
        </div>

        <p className={styles.hostBio}>
          Imóveis projetados com sofisticação para proporcionar máximo conforto, espaço e momentos inesquecíveis. Nossa equipe cuida de cada detalhe da sua hospedagem.
        </p>

        <div className={styles.contactInfo}>
          <div className={styles.contactItem}>
            <Clock size={16} className={styles.contactIcon} />
            <span>Responde em até 1 hora</span>
          </div>
          <div className={styles.contactItem}>
            <MessageSquare size={16} className={styles.contactIcon} />
            <span>Sempre utilize a plataforma Zhivago para pagamentos e mensagens seguras</span>
          </div>
        </div>
      </div>
    </section>
  );
}
