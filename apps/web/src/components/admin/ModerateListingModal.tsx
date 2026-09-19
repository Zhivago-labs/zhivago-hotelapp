"use client";

import { useState } from "react";
import { ShieldAlert, X } from "lucide-react";
import {
  approveListingAction,
  pendingListingAction,
  rejectListingAction,
  adminDeleteListingAction,
} from "@/lib/actions/admin";
import { ActionForm } from "@/components/ActionForm";
import { ConfirmSubmitButton } from "@/components/dashboard/ConfirmSubmitButton";
import { RejectListingButton } from "@/components/admin/RejectListingButton";
import styles from "./ModerateListingModal.module.css";

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  APPROVED: { label: "Aprovado", color: "#22c55e" },
  PENDING: { label: "Pendente", color: "#f59e0b" },
  REJECTED: { label: "Rejeitado", color: "#ef4444" },
  SOLD: { label: "Vendido", color: "#64748b" },
};

export function ModerateListingTrigger({ listingId, listingName, status }: { listingId: string; listingName: string; status: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className={styles.trigger}
        title="Moderar anúncio"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
      >
        <ShieldAlert size={16} />
      </button>

      {open && (
        <div
          className={styles.overlay}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setOpen(false);
          }}
        >
          <div className={styles.modal} onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
            <div className={styles.header}>
              <h3 className={styles.title}>Moderar anúncio</h3>
              <button type="button" className={styles.closeBtn} onClick={() => setOpen(false)} aria-label="Fechar">
                <X size={18} />
              </button>
            </div>

            <p className={styles.listingName}>{listingName}</p>

            <span
              className={styles.statusBadge}
              style={{
                background: `${(STATUS_LABEL[status] ?? { color: "#9ca3af" }).color}22`,
                color: (STATUS_LABEL[status] ?? { color: "#9ca3af" }).color,
              }}
            >
              {STATUS_LABEL[status]?.label ?? status}
            </span>

            <div className={styles.actions}>
              {status !== "APPROVED" && (
                <ActionForm action={approveListingAction}>
                  <input type="hidden" name="id" value={listingId} />
                  <button type="submit" className={styles.approveButton}>
                    Aprovar
                  </button>
                </ActionForm>
              )}

              {status !== "REJECTED" && (
                <ActionForm action={rejectListingAction}>
                  <input type="hidden" name="id" value={listingId} />
                  <input type="hidden" name="reason" value="" />
                  <RejectListingButton listingName={listingName} className={styles.rejectButton} />
                </ActionForm>
              )}

              {status !== "PENDING" && (
                <ActionForm action={pendingListingAction}>
                  <input type="hidden" name="id" value={listingId} />
                  <button type="submit" className={styles.pendingButton}>
                    Marcar pendente
                  </button>
                </ActionForm>
              )}

              <ActionForm action={adminDeleteListingAction}>
                <input type="hidden" name="id" value={listingId} />
                <ConfirmSubmitButton
                  className={styles.deleteButton}
                  confirmMessage={`Remover "${listingName}" definitivamente? Esta ação não pode ser desfeita.`}
                >
                  Excluir
                </ConfirmSubmitButton>
              </ActionForm>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
