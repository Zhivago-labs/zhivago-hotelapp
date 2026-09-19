import Link from "next/link";
import {
  MapPin,
  Check,
  RotateCcw,
  Trash2,
  ExternalLink,
  Camera,
  Building,
  Clock,
} from "lucide-react";
import type { AdminListing } from "@/lib/admin-api";
import {
  approveListingAction,
  pendingListingAction,
  rejectListingAction,
  adminDeleteListingAction,
} from "@/lib/actions/admin";
import { ActionForm } from "@/components/ActionForm";
import { ConfirmSubmitButton } from "@/components/dashboard/ConfirmSubmitButton";
import { RejectListingButton } from "./RejectListingButton";
import styles from "./AdminListingCard.module.css";

const STATUS_CONFIG: Record<string, { label: string; bg: string; color: string; dot: string; pulse?: boolean }> = {
  APPROVED: {
    label: "Aprovado no Catálogo",
    bg: "rgba(34, 197, 94, 0.12)",
    color: "#15803d",
    dot: "#22c55e",
  },
  PENDING: {
    label: "Pendente de Análise",
    bg: "rgba(245, 158, 11, 0.15)",
    color: "#b45309",
    dot: "#f59e0b",
    pulse: true,
  },
  REJECTED: {
    label: "Rejeitado",
    bg: "rgba(239, 68, 68, 0.12)",
    color: "#b91c1c",
    dot: "#ef4444",
  },
};

function formatCreatedDate(dateStr: string) {
  try {
    const d = new Date(dateStr);
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(d);
  } catch {
    return dateStr;
  }
}

function getInitials(name?: string) {
  if (!name) return "U";
  const parts = name.trim().split(" ");
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function AdminListingCard({ listing }: { listing: AdminListing }) {
  const statusCfg = STATUS_CONFIG[listing.status] ?? {
    label: listing.status,
    bg: "rgba(156, 163, 175, 0.12)",
    color: "#4b5563",
    dot: "#9ca3af",
  };

  const formattedPrice = listing.price.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });

  const photoCount = listing.images?.length ?? 0;
  const coverUrl = listing.images?.[0]?.url;
  const createdDate = formatCreatedDate(listing.createdAt);

  return (
    <div className={styles.card}>
      {/* Cover / Media section */}
      <div className={styles.mediaContainer}>
        {coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={coverUrl} alt={listing.name} className={styles.image} />
        ) : (
          <div className={styles.noImage}>
            <Building size={28} />
            <span>Sem imagens</span>
          </div>
        )}

        <div className={styles.overlayTop}>
          <span
            className={styles.statusBadge}
            style={{
              background: statusCfg.bg,
              color: statusCfg.color,
            }}
          >
            <span
              className={`${styles.statusDot} ${statusCfg.pulse ? styles.pulseDot : ""}`}
              style={{ background: statusCfg.dot }}
            />
            {statusCfg.label}
          </span>

          <Link
            href={`/imovel/${listing.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.previewBtn}
            title="Inspecionar imóvel completo em nova aba"
          >
            <span>Ver anúncio</span>
            <ExternalLink size={12} />
          </Link>
        </div>

        <div className={styles.overlayBottom}>
          <span className={styles.badgePill}>
            <Camera size={12} />
            <span>{photoCount} {photoCount === 1 ? "foto" : "fotos"}</span>
          </span>

          {listing.category && (
            <span className={styles.badgePill} style={{ textTransform: "capitalize" }}>
              {listing.category}
            </span>
          )}
        </div>
      </div>

      {/* Body content */}
      <div className={styles.body}>
        <div className={styles.mainInfo}>
          <h3 className={styles.name} title={listing.name}>
            {listing.name}
          </h3>

          <p className={styles.location}>
            <MapPin size={13} style={{ flexShrink: 0 }} />
            <span>{listing.location}</span>
          </p>

          <div className={styles.priceRow}>
            <span className={styles.price}>{formattedPrice}</span>
            {listing.category === "aluguel" && (
              <span className={styles.cycle}>
                / {listing.billingCycle ?? "mês"}
              </span>
            )}
          </div>
        </div>

        {/* Owner details */}
        {listing.owner && (
          <div className={styles.ownerBox}>
            <div className={styles.ownerAvatar}>
              {getInitials(listing.owner.name)}
            </div>
            <div className={styles.ownerMeta}>
              <span className={styles.ownerName} title={listing.owner.name}>
                {listing.owner.name}
              </span>
              <span className={styles.ownerEmail} title={listing.owner.email}>
                {listing.owner.email}
              </span>
            </div>
          </div>
        )}

        <div className={styles.metaRow}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
            <Clock size={12} />
            Cadastrado em {createdDate}
          </span>
          <span>ID #{listing.id.slice(-6).toUpperCase()}</span>
        </div>

        {/* Action Toolbar */}
        <div className={styles.actions}>
          {listing.status !== "APPROVED" && (
            <ActionForm action={approveListingAction} className={styles.actionForm}>
              <input type="hidden" name="id" value={listing.id} />
              <button type="submit" className={styles.approveBtn}>
                <Check size={14} />
                <span>Aprovar</span>
              </button>
            </ActionForm>
          )}

          {listing.status !== "REJECTED" && (
            <ActionForm action={rejectListingAction} className={styles.actionForm}>
              <input type="hidden" name="id" value={listing.id} />
              <input type="hidden" name="reason" value="" />
              <RejectListingButton listingName={listing.name} />
            </ActionForm>
          )}

          {listing.status !== "PENDING" && (
            <ActionForm action={pendingListingAction} className={styles.actionForm}>
              <input type="hidden" name="id" value={listing.id} />
              <button type="submit" className={styles.pendingBtn} title="Retornar à fila de moderação">
                <RotateCcw size={13} />
                <span>Pendente</span>
              </button>
            </ActionForm>
          )}

          <ActionForm action={adminDeleteListingAction} className={styles.actionForm}>
            <input type="hidden" name="id" value={listing.id} />
            <ConfirmSubmitButton
              className={styles.deleteBtn}
              confirmMessage={`Remover "${listing.name}" definitivamente? Esta ação não pode ser desfeita.`}
            >
              <Trash2 size={13} />
              <span>Excluir</span>
            </ConfirmSubmitButton>
          </ActionForm>
        </div>
      </div>
    </div>
  );
}
