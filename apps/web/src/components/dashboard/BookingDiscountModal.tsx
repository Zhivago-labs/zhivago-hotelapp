"use client";

import { useState, useActionState, useEffect } from "react";
import { Tag, X, Check, RotateCcw } from "lucide-react";
import { setBookingDiscountAction } from "@/lib/actions/listings";
import styles from "./DiscountModal.module.css";

interface Props {
  booking: { id: string; price: number; discountedPrice: number | null; guestName: string };
  onClose: () => void;
}

export function BookingDiscountModal({ booking, onClose }: Props) {
  const [state, formAction, pending] = useActionState(setBookingDiscountAction, undefined);
  const hasActiveDiscount = booking.discountedPrice != null && booking.discountedPrice < booking.price;
  const [customPrice, setCustomPrice] = useState<string>(
    hasActiveDiscount ? String(booking.discountedPrice) : ""
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div>
            <h3 className={styles.headerTitle}>
              <Tag size={20} className={styles.headerTitleIcon} />
              <span>{hasActiveDiscount ? "Gerenciar Desconto da Reserva" : "Aplicar Desconto na Reserva"}</span>
            </h3>
            <p className={styles.headerSubtitle}>
              Vale só para a reserva de {booking.guestName} — não muda o preço do anúncio.
            </p>
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose} title="Fechar">
            <X size={16} />
          </button>
        </div>

        <div className={styles.listingInfo}>
          <div>
            <p className={styles.listingName}>Valor da reserva</p>
          </div>
          <span className={styles.listingPrice}>
            {booking.price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
          </span>
        </div>

        <form action={formAction}>
          <input type="hidden" name="id" value={booking.id} />

          <div className={styles.customPriceWrap} style={{ marginTop: 0 }}>
            <p className={styles.sectionLabel}>Valor Promocional para esta reserva (R$)</p>
            <div className={styles.inputWrap}>
              <span className={styles.currencyPrefix}>R$</span>
              <input
                type="number"
                name="customPrice"
                min="1"
                step="1"
                placeholder={`Ex: ${Math.round(booking.price * 0.9)}`}
                value={customPrice}
                onChange={(e) => setCustomPrice(e.target.value)}
                className={styles.priceInput}
              />
            </div>
          </div>

          {state?.error && <p className={styles.error} style={{ marginTop: "12px" }}>{state.error}</p>}

          {hasActiveDiscount && (
            <button
              type="submit"
              name="intent"
              value="remove"
              className={styles.removeDiscountBtn}
              disabled={pending}
            >
              <RotateCcw size={15} />
              <span>
                Remover Desconto (Voltar para {booking.price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })})
              </span>
            </button>
          )}

          <div className={styles.actions}>
            <button type="button" className={styles.cancelBtn} onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" name="intent" value="apply" className={styles.submitBtn} disabled={pending}>
              <Check size={16} />
              <span>{pending ? "Salvando…" : "Aplicar Desconto"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
