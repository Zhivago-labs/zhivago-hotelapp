"use client";

import { useState } from "react";
import Link from "next/link";
import { BedDouble, Droplet, Car, Maximize2, BadgeCheck, ChevronLeft, ChevronRight } from "lucide-react";
import type { Listing } from "@zhivago/shared";
import { formatPrice } from "@/lib/api";
import { FavoriteButton } from "@/components/favorites/FavoriteButton";
import { ModerateListingTrigger } from "@/components/admin/ModerateListingModal";
import { PropertyPhotoViewer } from "@/components/listing/PropertyPhotoViewer";
import styles from "./ListingCard.module.css";

const TYPE_LABELS: Record<Listing["type"], string> = {
  casa: "Casa",
  apartamento: "Apartamento",
};

const CATEGORY_LABELS: Record<Listing["category"], string> = {
  aluguel: "Aluguel",
  venda: "Venda",
};

export function ListingCard({ listing, isAdmin = false }: { listing: Listing; isAdmin?: boolean }) {
  // Garantir fallback idêntico ao do mobile
  const bedrooms = listing.bedrooms || 0;
  const bathrooms = listing.bathrooms || 0;
  const parking = listing.parking || 0;

  const images = listing.images && listing.images.length > 0 ? listing.images : [];
  const [modalOpen, setModalOpen] = useState(false);
  const [activeImageIndex, setActiveImageIndex] = useState(0);

  const prevPhoto = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setActiveImageIndex((prev) => (prev - 1 + images.length) % images.length);
  };

  const nextPhoto = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setActiveImageIndex((prev) => (prev + 1) % images.length);
  };

  const handleOpenPhotos = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (images.length > 0) {
      setModalOpen(true);
    }
  };

  const hasDiscount = Boolean(
    listing.originalPrice && Number(listing.originalPrice) > listing.price
  );
  const discountPercent = hasDiscount
    ? Math.round(((Number(listing.originalPrice) - listing.price) / Number(listing.originalPrice)) * 100)
    : 0;

  // Mesma regra da página de detalhes: só existe selo de verificação para imobiliária
  // (dono pessoa física verificado não é exibido como "verificado" — sem base para isso).
  const isVerified = Boolean(
    (listing.owner?.accountType === "AGENCY" && listing.owner?.verified) || listing.organization?.verified
  );

  const currentImage = images[activeImageIndex] ?? images[0];
  const hasMultiple = images.length > 1;

  return (
    <>
      <div className={styles.card}>
        <div className={styles.imageWrap} onClick={handleOpenPhotos} title="Clique para abrir as fotos">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={currentImage?.url || "/placeholder.jpg"}
            alt={listing.name}
            className={styles.image}
            loading="lazy"
            decoding="async"
          />

          {isAdmin && (
            <ModerateListingTrigger listingId={listing.id} listingName={listing.name} status={listing.status} />
          )}

          {listing.status === "SOLD" ? (
            <span className={styles.soldBadge}>VENDIDO</span>
          ) : hasDiscount ? (
            <span className={styles.discountBadge}>{discountPercent}% OFF</span>
          ) : null}

          {/* Setas de navegação inline no card (estilo clássico Airbnb) */}
          {hasMultiple && (
            <>
              <button
                type="button"
                className={`${styles.cardArrow} ${styles.cardArrowLeft}`}
                onClick={prevPhoto}
                aria-label="Foto anterior"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                type="button"
                className={`${styles.cardArrow} ${styles.cardArrowRight}`}
                onClick={nextPhoto}
                aria-label="Próxima foto"
              >
                <ChevronRight size={16} />
              </button>

              {/* Indicadores de pontinhos (dots pagination) */}
              <div className={styles.dotsPagination}>
                {images.slice(0, 5).map((_, i) => (
                  <span
                    key={i}
                    className={`${styles.dot} ${i === activeImageIndex % 5 ? styles.dotActive : ""}`}
                  />
                ))}
              </div>
            </>
          )}

          <button
            type="button"
            className={styles.imageOverlayBadge}
            onClick={handleOpenPhotos}
            aria-label="Ver todas as fotos"
          >
            <Maximize2 size={12} />
            <span>{hasMultiple ? `${activeImageIndex + 1}/${images.length}` : "Ver foto"}</span>
          </button>

          <div className={styles.favoriteWrap} onClick={(e) => e.stopPropagation()}>
            <FavoriteButton listingId={listing.id} />
          </div>
        </div>

        <Link href={`/imovel/${listing.id}`} className={styles.info}>
          <div className={styles.tagRow}>
            <span className={styles.typeTag}>{TYPE_LABELS[listing.type]}</span>
            <span className={styles.categoryTag}>{CATEGORY_LABELS[listing.category]}</span>
            {isVerified && (
              <span className={styles.verifiedTag}>
                <BadgeCheck size={12} />
                Verificado
              </span>
            )}
          </div>
          <h3 className={styles.name}>{listing.name}</h3>
          <p className={styles.location}>{listing.location}</p>
          <div className={styles.amenities}>
            <span className={styles.amenityItem} title={`${bedrooms} quartos`}>
              <BedDouble size={15} />
              <span>{bedrooms}</span>
            </span>
            <span className={styles.amenityItem} title={`${bathrooms} banheiros`}>
              <Droplet size={15} />
              <span>{bathrooms}</span>
            </span>
            <span className={styles.amenityItem} title={`${parking} vagas`}>
              <Car size={15} />
              <span>{parking}</span>
            </span>
          </div>

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
            <span className={styles.price}>{formatPrice(listing)}</span>
            {hasDiscount && <span className={styles.discountTag}>{discountPercent}% OFF</span>}
          </div>
        </Link>
      </div>

      {/* ── VISUALIZADOR CINEMATOGRÁFICO DE FOTOS EM TELA CHEIA ── */}
      <PropertyPhotoViewer
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        images={images}
        initialIndex={activeImageIndex}
        title={listing.name}
        location={listing.location}
        priceLabel={formatPrice(listing)}
        listingId={listing.id}
      />
    </>
  );
}

