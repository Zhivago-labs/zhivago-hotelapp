"use client";

import { useState } from "react";
import Link from "next/link";
import { Eye, MessageCircle, Tag, Edit3, Copy } from "lucide-react";
import type { OwnedListing } from "@/lib/listings-api";
import {
  deleteListingAction,
  publishListingAction,
  unpublishListingAction,
  duplicateListingAction,
  approveOrgListingAction,
  rejectOrgListingAction,
} from "@/lib/actions/listings";
import { ActionForm } from "@/components/ActionForm";
import { ConfirmSubmitButton } from "./ConfirmSubmitButton";
import { RejectListingButton } from "../admin/RejectListingButton";
import { DiscountModal } from "./DiscountModal";
import styles from "./OwnerListingCard.module.css";

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  DRAFT: { label: "Rascunho", color: "#64748b" },
  APPROVED: { label: "Aprovado", color: "#22c55e" },
  PENDING: { label: "Em análise", color: "#f59e0b" },
  REJECTED: { label: "Rejeitado", color: "#ef4444" },
  REMOVED: { label: "Removido", color: "#9ca3af" },
  SOLD: { label: "Vendido", color: "#6366f1" },
};

export function OwnerListingCard({
  listing,
  canApproveOrgListings = false,
}: {
  listing: OwnedListing;
  canApproveOrgListings?: boolean;
}) {
  const [discountModalOpen, setDiscountModalOpen] = useState(false);

  const status = STATUS_LABEL[listing.status] ?? { label: listing.status, color: "#9ca3af" };
  const price = listing.price.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

  const hasDiscount = Boolean(
    listing.originalPrice && Number(listing.originalPrice) > listing.price
  );
  const discountPercent = hasDiscount
    ? Math.round(((Number(listing.originalPrice) - listing.price) / Number(listing.originalPrice)) * 100)
    : 0;

  return (
    <>
      <div className={styles.card}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={listing.images[0]?.url} alt={listing.name} className={styles.image} />

        <span className={styles.statusBadge} style={{ background: `${status.color}22`, color: status.color }}>
          <span className={styles.statusDot} style={{ background: status.color }} />
          {status.label}
        </span>

        {hasDiscount && <span className={styles.discountBadge}>{discountPercent}% OFF</span>}

        <div className={styles.body}>
          <p className={styles.name}>{listing.name}</p>
          <p className={styles.location}>{listing.location}</p>

          <div className={styles.priceRow}>
            {hasDiscount && (
              <span className={styles.oldPrice}>
                {Number(listing.originalPrice).toLocaleString("pt-BR", {
                  style: "currency",
                  currency: "BRL",
                  maximumFractionDigits: 0,
                })}
              </span>
            )}
            <span className={styles.price}>
              {price}
              {listing.category === "aluguel" ? ` / ${listing.billingCycle ?? "noite"}` : ""}
            </span>
            {hasDiscount && <span className={styles.discountTag}>{discountPercent}% OFF</span>}
          </div>

          <div className={styles.metrics}>
            <span className={styles.metric}>
              <Eye size={14} />
              {listing.viewCount} {listing.viewCount === 1 ? "visualização" : "visualizações"}
            </span>
            <span className={styles.metric}>
              <MessageCircle size={14} />
              {listing._count.conversations} {listing._count.conversations === 1 ? "contato" : "contatos"}
            </span>
          </div>

          <div className={styles.actions}>
            <Link href={`/anuncios/${listing.id}/editar`} className={styles.editButton}>
              <Edit3 size={13} />
              <span>Editar</span>
            </Link>

            <button
              type="button"
              className={styles.discountButton}
              onClick={() => setDiscountModalOpen(true)}
              title="Aplicar desconto percentual ou preço promocional"
            >
              <Tag size={13} />
              <span>Desconto</span>
            </button>

            {listing.status === "DRAFT" && (
              <ActionForm action={publishListingAction}>
                <input type="hidden" name="id" value={listing.id} />
                <button type="submit" className={styles.publishButton}>
                  Publicar
                </button>
              </ActionForm>
            )}

            {listing.status === "APPROVED" && (
              <ActionForm action={unpublishListingAction}>
                <input type="hidden" name="id" value={listing.id} />
                <button type="submit" className={styles.unpublishButton}>
                  Despublicar
                </button>
              </ActionForm>
            )}

            {listing.status === "PENDING" && canApproveOrgListings && (
              <>
                <ActionForm action={approveOrgListingAction}>
                  <input type="hidden" name="id" value={listing.id} />
                  <button type="submit" className={styles.publishButton}>
                    Aprovar
                  </button>
                </ActionForm>
                <ActionForm action={rejectOrgListingAction}>
                  <input type="hidden" name="id" value={listing.id} />
                  <input type="hidden" name="reason" />
                  <RejectListingButton listingName={listing.name} className={styles.deleteButton} />
                </ActionForm>
              </>
            )}

            <ActionForm action={duplicateListingAction}>
              <input type="hidden" name="id" value={listing.id} />
              <button type="submit" className={styles.duplicateButton} title="Criar cópia do anúncio">
                <Copy size={13} />
                <span>Duplicar</span>
              </button>
            </ActionForm>

            <ActionForm action={deleteListingAction}>
              <input type="hidden" name="id" value={listing.id} />
              <ConfirmSubmitButton
                className={styles.deleteButton}
                confirmMessage={`Remover "${listing.name}"? Esta ação não pode ser desfeita.`}
              >
                Excluir
              </ConfirmSubmitButton>
            </ActionForm>
          </div>
        </div>
      </div>

      {discountModalOpen && (
        <DiscountModal listing={listing} onClose={() => setDiscountModalOpen(false)} />
      )}
    </>
  );
}
