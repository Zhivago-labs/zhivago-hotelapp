"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { AmenitiesModal } from "./AmenitiesModal";
import { AVAILABLE_AMENITIES } from "@/components/listings/AmenitiesSelector";
import styles from "./ListingOverview.module.css";

const AMENITIES_PREVIEW = 8;

function parseAmenities(amenities: string | null | undefined): string[] {
  if (!amenities) return [];
  try {
    if (amenities.startsWith("[")) return JSON.parse(amenities);
    return amenities.split(",").map((s) => s.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

/** "Sobre o imóvel": descrição do anunciante, recolhida quando é longa. */
export function ListingAbout({ description }: { description: string | null }) {
  const [expanded, setExpanded] = useState(false);
  const text = description?.trim() ?? "";
  const isLong = text.length > 420;

  return (
    <section className={styles.about}>
      <h2 className={styles.aboutTitle}>Sobre o imóvel</h2>
      {text ? (
        <>
          <p className={`${styles.aboutText} ${isLong && !expanded ? styles.aboutTextClamped : ""}`}>{text}</p>
          {isLong && (
            <button type="button" className={styles.moreBtn} onClick={() => setExpanded(!expanded)}>
              {expanded ? "Mostrar menos" : "Mostrar mais"}
              {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            </button>
          )}
        </>
      ) : (
        <p className={styles.aboutEmpty}>O anunciante não inseriu uma descrição para este imóvel.</p>
      )}
    </section>
  );
}

/**
 * Comodidades — só as que o anunciante marcou de verdade (seção 88/61 da spec); sem nenhuma, o
 * quadro não aparece.
 */
export function ListingAmenities({ amenities }: { amenities?: string | null }) {
  const [modalOpen, setModalOpen] = useState(false);
  const selected = parseAmenities(amenities);
  const items = AVAILABLE_AMENITIES.filter((item) => selected.includes(item.id));

  if (items.length === 0) return null;

  return (
    <div className={styles.box} id="diferenciais">
      <h3 className={styles.boxTitle}>Comodidades</h3>
      <ul className={styles.amenityList}>
        {items.slice(0, AMENITIES_PREVIEW).map((item) => (
          <li key={item.id} className={styles.amenity}>
            <item.icon size={15} className={styles.amenityIcon} />
            {item.label}
          </li>
        ))}
      </ul>
      {items.length > AMENITIES_PREVIEW && (
        <button type="button" className={styles.moreBtn} onClick={() => setModalOpen(true)}>
          Ver todas as {items.length} comodidades
        </button>
      )}
      {modalOpen && <AmenitiesModal amenities={amenities} onClose={() => setModalOpen(false)} />}
    </div>
  );
}
