"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import { AmenitiesModal } from "./AmenitiesModal";
import { AVAILABLE_AMENITIES } from "@/components/listings/AmenitiesSelector";
import styles from "./ListingDescriptionSection.module.css";

interface Props {
  description: string | null;
  bedrooms: number;
  bathrooms: number;
  parking: number;
  type: string;
  location: string;
  amenities?: string | null;
}

export function ListingDescriptionSection({
  description,
  amenities,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [amenitiesModalOpen, setAmenitiesModalOpen] = useState(false);

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
  const displayAmenities = activeAmenities.length > 0 ? activeAmenities : AVAILABLE_AMENITIES.slice(0, 8);

  const hasHostDescription = Boolean(description && description.trim().length > 0);
  const fullText = hasHostDescription ? description!.trim() : "";
  const isLongText = fullText.length > 280;

  return (
    <>
      {/* Seção Sobre o espaço com expansão */}
      <section className={styles.descriptionBox}>
        <h2 className={styles.sectionTitle}>Sobre este espaço</h2>
        {hasHostDescription ? (
          <>
            <p
              className={`${styles.descriptionText} ${
                isLongText && !expanded ? styles.descriptionTextTruncated : ""
              }`}
            >
              {fullText}
            </p>

            {isLongText && (
              <button
                type="button"
                className={styles.showMoreBtn}
                onClick={() => setExpanded(!expanded)}
              >
                <span>{expanded ? "Mostrar menos" : "Mostrar mais"}</span>
                {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
            )}
          </>
        ) : (
          <p className={styles.descriptionText} style={{ color: "var(--muted)", fontStyle: "italic" }}>
            O anfitrião não inseriu uma descrição detalhada para este imóvel.
          </p>
        )}
      </section>

      {/* Seção O que esse lugar oferece */}
      <section className={styles.amenitiesSection}>
        <h2 className={styles.sectionTitle}>O que esse lugar oferece</h2>
        <div className={styles.amenitiesGrid}>
          {displayAmenities.slice(0, 8).map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.id} className={styles.amenityItem}>
                <Icon size={22} className={styles.amenityIcon} />
                <span>{item.label}</span>
              </div>
            );
          })}
        </div>

        <button
          type="button"
          className={styles.allAmenitiesBtn}
          onClick={() => setAmenitiesModalOpen(true)}
        >
          <Sparkles size={16} />
          <span>Mostrar todas as {displayAmenities.length} comodidades</span>
        </button>
      </section>

      {/* Modal de Comodidades */}
      {amenitiesModalOpen && (
        <AmenitiesModal amenities={amenities} onClose={() => setAmenitiesModalOpen(false)} />
      )}
    </>
  );
}
