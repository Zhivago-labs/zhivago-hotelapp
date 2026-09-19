"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
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
  const [index, setIndex] = useState(0);
  const hasMultiple = images.length > 1;
  const current = images[index] ?? images[0];

  const goTo = (next: number) => setIndex((next + images.length) % images.length);

  return (
    <div className={styles.wrap}>
      <div className={styles.imageWrap}>
        {children}
        {current && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={current.url} alt={alt} className={styles.image} />
        )}

        {hasMultiple && (
          <>
            <button
              type="button"
              className={`${styles.arrow} ${styles.arrowLeft}`}
              onClick={() => goTo(index - 1)}
              aria-label="Foto anterior"
            >
              <ChevronLeft size={20} />
            </button>
            <button
              type="button"
              className={`${styles.arrow} ${styles.arrowRight}`}
              onClick={() => goTo(index + 1)}
              aria-label="Próxima foto"
            >
              <ChevronRight size={20} />
            </button>
            <span className={styles.counter}>
              {index + 1} / {images.length}
            </span>
          </>
        )}
      </div>

      {hasMultiple && (
        <div className={styles.thumbStrip}>
          {images.map((img, i) => (
            <button
              key={img.id}
              type="button"
              className={`${styles.thumbButton} ${i === index ? styles.thumbButtonActive : ""}`}
              onClick={() => setIndex(i)}
              aria-label={`Ver foto ${i + 1}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt="" className={styles.thumbImage} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
