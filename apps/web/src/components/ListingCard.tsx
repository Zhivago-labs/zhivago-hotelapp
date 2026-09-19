"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { BedDouble, Droplet, Car, Maximize2, X, ChevronLeft, ChevronRight, ArrowRight, BadgeCheck } from "lucide-react";
import type { Listing } from "@zhivago/shared";
import { formatPrice } from "@/lib/api";
import { FavoriteButton } from "@/components/favorites/FavoriteButton";
import { ModerateListingTrigger } from "@/components/admin/ModerateListingModal";
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

  // Fecha com tecla ESC e navega com setas
  useEffect(() => {
    if (!modalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setModalOpen(false);
      if (e.key === "ArrowLeft") setActiveImageIndex((prev) => (prev > 0 ? prev - 1 : prev));
      if (e.key === "ArrowRight") setActiveImageIndex((prev) => (prev < images.length - 1 ? prev + 1 : prev));
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [modalOpen, images.length]);

  const handleImageClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (images.length > 0) {
      setActiveImageIndex(0);
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

  return (
    <>
      <div className={styles.card}>
        <div className={styles.imageWrap} onClick={handleImageClick} title="Clique para ampliar as fotos">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={images[0]?.url || "/placeholder.jpg"}
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

          <div className={styles.imageOverlayBadge}>
            <Maximize2 size={13} />
            <span>Ver fotos {images.length > 1 ? `(${images.length})` : ""}</span>
          </div>

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

      {/* ── MODAL LIGHTBOX DE FOTOS DO IMÓVEL ── */}
      {modalOpen && images.length > 0 && (
        <div className={styles.lightboxOverlay} onClick={() => setModalOpen(false)}>
          <div className={styles.lightboxContent} onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className={styles.lightboxHeader}>
              <div className={styles.lightboxHeaderInfo}>
                <h4 className={styles.lightboxTitle}>{listing.name}</h4>
                <span className={styles.lightboxCounter}>
                  Foto {activeImageIndex + 1} de {images.length}
                </span>
              </div>
              <button
                type="button"
                className={styles.lightboxCloseBtn}
                onClick={() => setModalOpen(false)}
                title="Fechar (Esc)"
              >
                <X size={18} />
              </button>
            </div>

            {/* Imagem Ampliada */}
            <div className={styles.lightboxImageWrap}>
              {activeImageIndex > 0 && (
                <button
                  type="button"
                  className={`${styles.navBtn} ${styles.prevBtn}`}
                  onClick={() => setActiveImageIndex(activeImageIndex - 1)}
                  title="Foto anterior (Seta esquerda)"
                >
                  <ChevronLeft size={24} />
                </button>
              )}

              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={images[activeImageIndex]?.url}
                alt={`${listing.name} - Foto ${activeImageIndex + 1}`}
                className={styles.lightboxImage}
              />

              {activeImageIndex < images.length - 1 && (
                <button
                  type="button"
                  className={`${styles.navBtn} ${styles.nextBtn}`}
                  onClick={() => setActiveImageIndex(activeImageIndex + 1)}
                  title="Próxima foto (Seta direita)"
                >
                  <ChevronRight size={24} />
                </button>
              )}
            </div>

            {/* Footer do Modal com atalho para a página do imóvel */}
            <div className={styles.lightboxFooter}>
              <div className={styles.lightboxFooterInfo}>
                <span className={styles.lightboxLocation}>{listing.location}</span>
                <span className={styles.lightboxPrice}>{formatPrice(listing)}</span>
              </div>
              <Link href={`/imovel/${listing.id}`} className={styles.lightboxDetailLink}>
                <span>Ver detalhes do imóvel</span>
                <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

