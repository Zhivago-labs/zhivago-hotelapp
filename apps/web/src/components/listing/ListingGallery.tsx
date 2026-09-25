"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, LayoutGrid } from "lucide-react";
import { PropertyPhotoViewer } from "./PropertyPhotoViewer";
import styles from "./ListingGallery.module.css";

interface GalleryImage {
  id: string;
  url: string;
}

export function ListingGallery({
  images,
  alt,
  children,
}: {
  images: GalleryImage[];
  alt: string;
  children?: React.ReactNode;
}) {
  const [mobileIndex, setMobileIndex] = useState(0);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerInitialIndex, setViewerInitialIndex] = useState(0);

  const hasImages = images && images.length > 0;
  const total = images.length;

  const openViewer = (indexToOpen: number) => {
    setViewerInitialIndex(indexToOpen);
    setViewerOpen(true);
  };

  const nextMobile = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMobileIndex((prev) => (prev + 1) % total);
  };

  const prevMobile = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMobileIndex((prev) => (prev - 1 + total) % total);
  };

  if (!hasImages) {
    return (
      <div className={styles.emptyGallery}>
        <div className={styles.emptyPlaceholder}>Sem fotos disponíveis</div>
      </div>
    );
  }

  // Fotos para o mosaico (até 5 fotos no desktop)
  const mainPhoto = images[0];
  const sidePhotos = images.slice(1, 5);
  const hasSidePhotos = sidePhotos.length > 0;

  return (
    <>
      <div className={styles.galleryWrapper}>
        {/* ── VERSÃO DESKTOP: MOSAICO CLÁSSICO AIRBNB ── */}
        <div className={styles.desktopMosaic}>
          {children}

          {/* Foto Principal (Esquerda) */}
          <div
            className={`${styles.mosaicItem} ${styles.mosaicMain} ${!hasSidePhotos ? styles.mosaicOnlyOne : ""}`}
            onClick={() => openViewer(0)}
            role="button"
            tabIndex={0}
            aria-label="Abrir foto principal"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={mainPhoto.url} alt={`${alt} - Foto principal`} className={styles.mosaicImg} />
            <div className={styles.mosaicHoverOverlay} />
          </div>

          {/* Fotos Laterais (Direita, até 4 fotos) */}
          {hasSidePhotos && (
            <div className={`${styles.mosaicSideGrid} ${styles[`mosaicSideCount${sidePhotos.length}`]}`}>
              {sidePhotos.map((photo, i) => {
                const photoIndex = i + 1;
                return (
                  <div
                    key={photo.id ?? photo.url}
                    className={styles.mosaicItem}
                    onClick={() => openViewer(photoIndex)}
                    role="button"
                    tabIndex={0}
                    aria-label={`Abrir foto ${photoIndex + 1}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photo.url} alt={`${alt} - Foto ${photoIndex + 1}`} className={styles.mosaicImg} />
                    <div className={styles.mosaicHoverOverlay} />
                  </div>
                );
              })}
            </div>
          )}

          {/* Botão Icônico Airbnb: "Mostrar todas as fotos" */}
          <button
            type="button"
            className={styles.airbnbShowAllBtn}
            onClick={() => openViewer(0)}
            aria-label="Mostrar todas as fotos do imóvel"
          >
            <LayoutGrid size={15} />
            <span>Mostrar todas as fotos {total > 1 ? `(${total})` : ""}</span>
          </button>
        </div>

        {/* ── VERSÃO MOBILE: CARROSSEL CLEAN AIRBNB ── */}
        <div className={styles.mobileCarousel} onClick={() => openViewer(mobileIndex)}>
          {children}

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={images[mobileIndex]?.url ?? mainPhoto.url}
            alt={`${alt} - Foto ${mobileIndex + 1}`}
            className={styles.mobileImg}
          />

          {total > 1 && (
            <>
              <button
                type="button"
                className={`${styles.mobileArrow} ${styles.mobileArrowLeft}`}
                onClick={prevMobile}
                aria-label="Foto anterior"
              >
                <ChevronLeft size={20} />
              </button>

              <button
                type="button"
                className={`${styles.mobileArrow} ${styles.mobileArrowRight}`}
                onClick={nextMobile}
                aria-label="Próxima foto"
              >
                <ChevronRight size={20} />
              </button>

              <span className={styles.mobileBadge}>
                {mobileIndex + 1} / {total}
              </span>
            </>
          )}
        </div>
      </div>

      {/* ── VISUALIZADOR AIRBNB FULLSCREEN EM MODOS CARROSSEL & GRADE ── */}
      <PropertyPhotoViewer
        isOpen={viewerOpen}
        onClose={() => setViewerOpen(false)}
        images={images}
        initialIndex={viewerInitialIndex}
        title={alt}
      />
    </>
  );
}
