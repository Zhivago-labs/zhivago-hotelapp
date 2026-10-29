"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Maximize2 } from "lucide-react";
import { PropertyPhotoViewer } from "./PropertyPhotoViewer";
import styles from "./ListingGallery.module.css";

interface GalleryImage {
  id: string;
  url: string;
}

const THUMB_COUNT = 4;

/**
 * Foto grande navegável (setas + contador) e, no desktop, uma coluna com as próximas 4 fotos —
 * a última mostra "+N fotos" quando há mais. Qualquer foto abre o visualizador em tela cheia.
 */
export function ListingGallery({
  images,
  alt,
  children,
}: {
  images: GalleryImage[];
  alt: string;
  children?: React.ReactNode;
}) {
  const [index, setIndex] = useState(0);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerInitialIndex, setViewerInitialIndex] = useState(0);

  const total = images.length;

  const openViewer = (indexToOpen: number) => {
    setViewerInitialIndex(indexToOpen);
    setViewerOpen(true);
  };

  const step = (delta: number) => (e: React.MouseEvent) => {
    e.stopPropagation();
    setIndex((prev) => (prev + delta + total) % total);
  };

  if (total === 0) {
    return (
      <div className={styles.emptyGallery}>
        <div className={styles.emptyPlaceholder}>Sem fotos disponíveis</div>
      </div>
    );
  }

  const thumbs = images.slice(1, 1 + THUMB_COUNT);
  const hiddenCount = total - 1 - thumbs.length;

  return (
    <>
      <div className={`${styles.gallery} ${thumbs.length === 0 ? styles.galleryOnlyMain : ""}`}>
        <div
          className={styles.main}
          onClick={() => openViewer(index)}
          role="button"
          tabIndex={0}
          aria-label="Abrir fotos em tela cheia"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={images[index].url} alt={`${alt} - Foto ${index + 1}`} className={styles.img} />
          {children}

          {total > 1 && (
            <>
              <span className={styles.counter}>
                {index + 1} / {total}
              </span>
              <button type="button" className={`${styles.arrow} ${styles.arrowLeft}`} onClick={step(-1)} aria-label="Foto anterior">
                <ChevronLeft size={20} />
              </button>
              <button type="button" className={`${styles.arrow} ${styles.arrowRight}`} onClick={step(1)} aria-label="Próxima foto">
                <ChevronRight size={20} />
              </button>
            </>
          )}

          <button
            type="button"
            className={styles.expand}
            onClick={(e) => {
              e.stopPropagation();
              openViewer(index);
            }}
            aria-label="Ver fotos em tela cheia"
          >
            <Maximize2 size={16} />
          </button>
        </div>

        {thumbs.length > 0 && (
          <div className={styles.thumbs}>
            {thumbs.map((photo, i) => {
              const photoIndex = i + 1;
              const isLast = i === thumbs.length - 1 && hiddenCount > 0;
              return (
                <button
                  type="button"
                  key={photo.id ?? photo.url}
                  className={styles.thumb}
                  onClick={() => (isLast ? openViewer(photoIndex) : setIndex(photoIndex))}
                  aria-label={isLast ? `Ver mais ${hiddenCount} fotos` : `Ver foto ${photoIndex + 1}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.url} alt={`${alt} - Foto ${photoIndex + 1}`} className={styles.img} />
                  {isLast && <span className={styles.moreOverlay}>+{hiddenCount} fotos</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>

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
