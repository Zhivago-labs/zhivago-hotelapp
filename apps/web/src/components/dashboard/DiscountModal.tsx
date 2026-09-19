"use client";

import { useState, useActionState, useEffect } from "react";
import { Tag, X, Check, Sparkles, RotateCcw } from "lucide-react";
import { applyDiscountAction } from "@/lib/actions/listings";
import styles from "./DiscountModal.module.css";

interface ListingItem {
  id: string;
  name: string;
  price: number;
  originalPrice?: number | null;
}

interface Props {
  listing: ListingItem;
  onClose: () => void;
}

const PRESET_DISCOUNTS = [5, 10, 15, 20, 25, 30, 40, 50];

export function DiscountModal({ listing, onClose }: Props) {
  const [state, formAction, pending] = useActionState(applyDiscountAction, undefined);
  const [selectedPercent, setSelectedPercent] = useState<number>(10);
  const [customPrice, setCustomPrice] = useState<string>("");

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const hasActiveDiscount = Boolean(
    listing.originalPrice && Number(listing.originalPrice) > listing.price
  );
  const basePrice = hasActiveDiscount ? Number(listing.originalPrice) : listing.price;

  // Cálculo do novo preço simulado sempre com base no preço original do imóvel
  let calculatedNewPrice = listing.price;
  if (customPrice && Number(customPrice) > 0) {
    calculatedNewPrice = Number(customPrice);
  } else if (selectedPercent > 0) {
    calculatedNewPrice = Math.round(basePrice * (1 - selectedPercent / 100));
  }

  const savings = Math.max(0, basePrice - calculatedNewPrice);

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Cabeçalho */}
        <div className={styles.header}>
          <div>
            <h3 className={styles.headerTitle}>
              <Tag size={20} className={styles.headerTitleIcon} />
              <span>{hasActiveDiscount ? "Gerenciar Desconto" : "Aplicar Desconto"}</span>
            </h3>
            <p className={styles.headerSubtitle}>
              Ofereça uma porcentagem de desconto ou defina um preço promocional exclusivo.
            </p>
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose} title="Fechar">
            <X size={16} />
          </button>
        </div>

        {/* Info do imóvel */}
        <div className={styles.listingInfo}>
          <div>
            <p className={styles.listingName}>{listing.name}</p>
            {hasActiveDiscount && (
              <span style={{ fontSize: "12px", color: "var(--muted)", textDecoration: "line-through" }}>
                Original: {basePrice.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
              </span>
            )}
          </div>
          <span className={styles.listingPrice}>
            {listing.price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
          </span>
        </div>

        {/* Form para Aplicar ou Remover Desconto */}
        <form action={formAction}>
          <input type="hidden" name="id" value={listing.id} />
          <input type="hidden" name="discountPercent" value={selectedPercent} />

          <div>
            <p className={styles.sectionLabel}>Porcentagem de Desconto (sobre R$ {basePrice.toLocaleString("pt-BR")})</p>
            <div className={styles.presetGrid}>
              {PRESET_DISCOUNTS.map((pct) => (
                <button
                  key={pct}
                  type="button"
                  className={`${styles.presetBtn} ${
                    selectedPercent === pct && !customPrice ? styles.presetBtnActive : ""
                  }`}
                  onClick={() => {
                    setSelectedPercent(pct);
                    setCustomPrice("");
                  }}
                >
                  {pct}% OFF
                </button>
              ))}
            </div>
          </div>

          {/* Campo de valor customizado */}
          <div className={styles.customPriceWrap}>
            <p className={styles.sectionLabel}>Ou defina o Valor Promocional (R$)</p>
            <div className={styles.inputWrap}>
              <span className={styles.currencyPrefix}>R$</span>
              <input
                type="number"
                name="customPrice"
                min="1"
                step="1"
                placeholder={`Ex: ${Math.round(basePrice * 0.9)}`}
                value={customPrice}
                onChange={(e) => {
                  setCustomPrice(e.target.value);
                  setSelectedPercent(0);
                }}
                className={styles.priceInput}
              />
            </div>
          </div>

          {/* Box de Preview da Economia */}
          <div className={styles.previewBox} style={{ marginTop: "16px" }}>
            <div className={styles.previewRow}>
              <span className={styles.previewLabel}>Preço base original:</span>
              <span className={styles.previewOldPrice}>
                {basePrice.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
              </span>
            </div>

            <div className={styles.previewRow}>
              <span className={styles.previewLabel}>Novo valor com desconto:</span>
              <span className={styles.previewNewPrice}>
                {calculatedNewPrice.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
              </span>
            </div>

            {savings > 0 && (
              <div className={styles.previewRow} style={{ marginTop: "2px" }}>
                <span className={styles.previewLabel} style={{ color: "var(--accent)" }}>
                  <Sparkles size={13} style={{ display: "inline", marginRight: "4px" }} />
                  Economia para o cliente:
                </span>
                <span style={{ fontWeight: 800, color: "var(--accent)" }}>
                  {savings.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </span>
              </div>
            )}
          </div>

          {state?.error && <p className={styles.error} style={{ marginTop: "12px" }}>{state.error}</p>}

          {/* Botão de Remover Desconto (se já houver desconto ativo) */}
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
                Remover Desconto (Voltar para {basePrice.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })})
              </span>
            </button>
          )}

          {/* Botões de Ação */}
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
