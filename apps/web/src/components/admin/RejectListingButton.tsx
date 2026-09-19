"use client";

import { useState, useRef } from "react";
import { AlertTriangle, X, Ban } from "lucide-react";
import styles from "./RejectListingButton.module.css";

const PRESET_REASONS = [
  "Fotos de baixa qualidade ou inadequadas",
  "Informações de contato na descrição",
  "Preço ou valores inconsistentes",
  "Endereço incompleto ou divergente",
  "Anúncio duplicado no catálogo",
  "Imóvel não atende às diretrizes de qualidade",
];

export function RejectListingButton({
  listingName,
  className,
}: {
  listingName: string;
  className?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [reason, setReason] = useState("");
  const formRef = useRef<HTMLFormElement | null>(null);

  const handleOpen = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    formRef.current = e.currentTarget.form;
    setReason("");
    setIsOpen(true);
  };

  const handleClose = () => {
    setIsOpen(false);
  };

  const handleConfirm = (e: React.MouseEvent) => {
    e.preventDefault();
    const trimmed = reason.trim();
    if (trimmed.length < 5) return;

    if (formRef.current) {
      const reasonInput = formRef.current.elements.namedItem("reason") as HTMLInputElement | null;
      if (reasonInput) {
        reasonInput.value = trimmed;
      }
      formRef.current.requestSubmit();
      setIsOpen(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className={className ?? styles.triggerBtn}
        onClick={handleOpen}
        title="Rejeitar anúncio"
      >
        <Ban size={13} />
        <span>Rejeitar</span>
      </button>

      {isOpen && (
        <div
          className={styles.overlay}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleClose();
          }}
        >
          <div
            className={styles.modal}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <div className={styles.header}>
              <div className={styles.titleArea}>
                <div className={styles.iconWrapper}>
                  <AlertTriangle size={18} />
                </div>
                <div>
                  <h3 className={styles.title}>Rejeitar Imóvel</h3>
                </div>
              </div>
              <button
                type="button"
                className={styles.closeBtn}
                onClick={handleClose}
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>

            <div className={styles.listingHighlight}>
              Anúncio: <strong>{listingName}</strong>
            </div>

            <p className={styles.presetTitle}>Motivos frequentes:</p>
            <div className={styles.presetList}>
              {PRESET_REASONS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className={styles.presetChip}
                  onClick={() => setReason(preset)}
                >
                  {preset}
                </button>
              ))}
            </div>

            <div className={styles.fieldGroup}>
              <label htmlFor="rejection-reason" className={styles.label}>
                Justificativa da rejeição (mín. 5 caracteres):
              </label>
              <textarea
                id="rejection-reason"
                className={styles.textarea}
                placeholder="Informe detalhadamente ao proprietário o motivo da reprovação deste anúncio..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                autoFocus
              />
              <span className={styles.helperText}>
                O proprietário receberá esta mensagem para poder corrigir e reenviar o anúncio.
              </span>
            </div>

            <div className={styles.footer}>
              <button
                type="button"
                className={styles.cancelBtn}
                onClick={handleClose}
              >
                Cancelar
              </button>
              <button
                type="button"
                className={styles.confirmBtn}
                disabled={reason.trim().length < 5}
                onClick={handleConfirm}
              >
                <Ban size={14} />
                <span>Confirmar Rejeição</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
