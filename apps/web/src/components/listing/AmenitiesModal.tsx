"use client";

import { useEffect } from "react";
import { X, Sparkles } from "lucide-react";
import { AVAILABLE_AMENITIES } from "@/components/listings/AmenitiesSelector";
import styles from "./AmenitiesModal.module.css";

interface Props {
  amenities?: string | null;
  onClose: () => void;
}

export function AmenitiesModal({ amenities, onClose }: Props) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const selectedIds: string[] = (() => {
    if (!amenities) return ["cozinha", "wifi", "workspace", "estacionamento", "piscina", "tv", "ar_condicionado", "cameras"];
    try {
      if (amenities.startsWith("[")) return JSON.parse(amenities);
      return amenities.split(",").map((s) => s.trim()).filter(Boolean);
    } catch {
      return ["cozinha", "wifi", "workspace", "estacionamento", "piscina", "tv", "ar_condicionado", "cameras"];
    }
  })();

  const activeAmenities = AVAILABLE_AMENITIES.filter((item) => selectedIds.includes(item.id));
  const listToRender = activeAmenities.length > 0 ? activeAmenities : AVAILABLE_AMENITIES;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h3 className={styles.title}>O que esse lugar oferece</h3>
          <button type="button" className={styles.closeBtn} onClick={onClose} title="Fechar (Esc)">
            <X size={18} />
          </button>
        </div>

        <div className={styles.content}>
          <div className={styles.categoryGroup}>
            <h4 className={styles.categoryTitle}>
              <Sparkles size={16} style={{ display: "inline", marginRight: "6px", color: "var(--accent)" }} />
              Comodidades selecionadas pelo anfitrião
            </h4>
            <div className={styles.amenityList}>
              {listToRender.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.id} className={styles.amenityItem}>
                    <Icon size={20} className={styles.amenityIcon} />
                    <span>{item.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
