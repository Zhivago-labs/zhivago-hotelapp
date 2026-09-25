"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  X,
  LayoutGrid,
  Maximize2,
  Share2,
  Check,
  ArrowUpRight,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import styles from "./PropertyPhotoViewer.module.css";

export interface PhotoViewerImage {
  id?: string;
  url: string;
}

interface PropertyPhotoViewerProps {
  isOpen: boolean;
  onClose: () => void;
  images: PhotoViewerImage[];
  initialIndex?: number;
  title: string;
  location?: string;
  priceLabel?: string;
  listingId?: string;
}

export function PropertyPhotoViewer({
  isOpen,
  onClose,
  images,
  initialIndex = 0,
  title,
  location,
  priceLabel,
  listingId,
}: PropertyPhotoViewerProps) {
  const [mounted, setMounted] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(64);
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [viewMode, setViewMode] = useState<"carousel" | "grid">("carousel");
  const [loaded, setLoaded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isZoomed, setIsZoomed] = useState(false);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const lastTapRef = useRef<number>(0);
  const thumbStripRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Mede dinamicamente a altura exata da navbar para posicionar a galeria logo abaixo dela
  useEffect(() => {
    if (!isOpen) return;

    const measureNavbar = () => {
      const header = document.querySelector("header");
      if (header) {
        const rect = header.getBoundingClientRect();
        if (rect.height > 0) {
          setHeaderHeight(Math.round(rect.height));
        }
      }
    };

    measureNavbar();
    window.addEventListener("resize", measureNavbar);
    return () => window.removeEventListener("resize", measureNavbar);
  }, [isOpen]);

  // Sincroniza o índice inicial sempre que o modal abre
  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(initialIndex);
      setLoaded(false);
      setViewMode("carousel");
      setIsZoomed(false);
      setPan({ x: 0, y: 0 });
    }
  }, [isOpen, initialIndex]);

  const hasMultiple = images.length > 1;
  const currentImage = images[currentIndex] ?? images[0];

  const goTo = useCallback(
    (newIndex: number) => {
      setLoaded(false);
      setIsZoomed(false);
      setPan({ x: 0, y: 0 });
      setCurrentIndex((newIndex + images.length) % images.length);
    },
    [images.length]
  );

  const toggleZoom = useCallback(() => {
    setIsZoomed((prev) => {
      if (prev) {
        setPan({ x: 0, y: 0 });
        return false;
      }
      return true;
    });
  }, []);

  // Manipulação de drag com mouse (Desktop)
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!isZoomed) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !isZoomed) return;
    setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Manipulação de touch com duplo toque para zoom e drag com dedo (Mobile)
  const handleTouchStart = (e: React.TouchEvent) => {
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      toggleZoom();
      lastTapRef.current = 0;
      return;
    }
    lastTapRef.current = now;

    if (isZoomed && e.touches.length === 1) {
      setIsDragging(true);
      setDragStart({
        x: e.touches[0].clientX - pan.x,
        y: e.touches[0].clientY - pan.y,
      });
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || !isZoomed || e.touches.length !== 1) return;
    setPan({
      x: e.touches[0].clientX - dragStart.x,
      y: e.touches[0].clientY - dragStart.y,
    });
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
  };

  // Bloqueio do scroll da página, controle de elementos flutuantes e atalhos de teclado (Airbnb style)
  useEffect(() => {
    if (!isOpen) {
      document.body.removeAttribute("data-photo-viewer-open");
      window.dispatchEvent(new CustomEvent("zhivago:photo-viewer", { detail: { open: false } }));
      return;
    }

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.body.setAttribute("data-photo-viewer-open", "true");
    window.dispatchEvent(new CustomEvent("zhivago:photo-viewer", { detail: { open: true } }));

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }
      if (viewMode === "carousel") {
        if (e.key === "ArrowLeft") goTo(currentIndex - 1);
        if (e.key === "ArrowRight") goTo(currentIndex + 1);
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);

    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.removeAttribute("data-photo-viewer-open");
      window.dispatchEvent(new CustomEvent("zhivago:photo-viewer", { detail: { open: false } }));
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [isOpen, currentIndex, goTo, onClose, viewMode]);

  // Centraliza a miniatura ativa
  useEffect(() => {
    if (!isOpen || viewMode !== "carousel" || !thumbStripRef.current) return;
    const activeThumb = thumbStripRef.current.children[currentIndex] as HTMLElement | undefined;
    if (activeThumb) {
      activeThumb.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    }
  }, [currentIndex, isOpen, viewMode]);

  const handleShare = async () => {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(window.location.href);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      }
    } catch {
      // Ignorar falha de clipboard silenciosamente
    }
  };

  if (!isOpen || !currentImage || !mounted) return null;

  const content = (
    <div
      className={styles.overlay}
      style={{
        top: `${headerHeight}px`,
        height: `calc(100dvh - ${headerHeight}px)`,
      }}
      role="dialog"
      aria-modal="true"
      aria-label={`Galeria de fotos de ${title}`}
    >
      {/* ── BARRA SUPERIOR (PADRÃO AIRBNB COM BOTÃO X DE FECHAR) ── */}
      <header className={styles.topBar}>
        <div className={styles.topBarLeft}>
          <span className={styles.topBarTitle}>{title}</span>
        </div>

        <div className={styles.topBarCenter}>
          {viewMode === "carousel" ? (
            <span className={styles.photoCounter}>
              {currentIndex + 1} / {images.length}
            </span>
          ) : (
            <span className={styles.photoCounter}>Todas as fotos ({images.length})</span>
          )}
        </div>

        <div className={styles.topBarRight}>
          {hasMultiple && (
            <button
              type="button"
              className={`${styles.viewToggleBtn} ${viewMode === "grid" ? styles.viewToggleBtnActive : ""}`}
              onClick={() => setViewMode(viewMode === "carousel" ? "grid" : "carousel")}
              title={viewMode === "carousel" ? "Mostrar todas em grade" : "Ver carrossel"}
            >
              {viewMode === "carousel" ? (
                <>
                  <LayoutGrid size={16} />
                  <span className={styles.toggleBtnText}>Ver grade</span>
                </>
              ) : (
                <>
                  <Maximize2 size={16} />
                  <span className={styles.toggleBtnText}>Ver fotos</span>
                </>
              )}
            </button>
          )}

          {/* Botão da Lupa de Zoom (Desktop e Mobile) */}
          {viewMode === "carousel" && (
            <button
              type="button"
              className={`${styles.iconActionBtn} ${isZoomed ? styles.zoomBtnActive : ""}`}
              onClick={toggleZoom}
              title={isZoomed ? "Reduzir zoom (1x)" : "Ampliar detalhes (Zoom)"}
              aria-label={isZoomed ? "Reduzir zoom" : "Ampliar foto"}
            >
              {isZoomed ? <ZoomOut size={18} /> : <ZoomIn size={18} />}
            </button>
          )}

          <button
            type="button"
            className={styles.iconActionBtn}
            onClick={handleShare}
            title={copied ? "Link copiado!" : "Compartilhar anúncio"}
            aria-label="Compartilhar"
          >
            {copied ? <Check size={18} className={styles.copiedIcon} /> : <Share2 size={18} />}
          </button>

          {/* Botão X Proeminente no canto superior direito */}
          <button
            type="button"
            className={styles.topRightCloseBtn}
            onClick={onClose}
            aria-label="Fechar galeria (Esc)"
            title="Fechar galeria (Esc)"
          >
            <X size={20} strokeWidth={2.2} />
          </button>
        </div>
      </header>

      {/* ── MODO 1: CARROSSEL CINEMATOGRÁFICO DE FOTO (AIRBNB PHOTO TOUR) ── */}
      {viewMode === "carousel" && (
        <div className={styles.carouselContainer}>
          <main className={styles.stage} onClick={onClose}>
            {hasMultiple && (
              <button
                type="button"
                className={`${styles.airbnbNavArrow} ${styles.airbnbNavPrev}`}
                onClick={(e) => {
                  e.stopPropagation();
                  goTo(currentIndex - 1);
                }}
                aria-label="Foto anterior"
                title="Foto anterior (Seta esquerda)"
              >
                <ChevronLeft size={22} />
              </button>
            )}

            <div
              className={`${styles.photoFrame} ${isZoomed ? styles.photoFrameZoomed : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                if (!isDragging) {
                  toggleZoom();
                }
              }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                key={currentImage.url}
                src={currentImage.url}
                alt={`${title} - Foto ${currentIndex + 1}`}
                className={`${styles.mainPhoto} ${loaded ? styles.mainPhotoLoaded : ""} ${isZoomed ? styles.mainPhotoZoomed : ""}`}
                style={
                  isZoomed
                    ? {
                        transform: `scale(2.2) translate(${pan.x / 2.2}px, ${pan.y / 2.2}px)`,
                        cursor: isDragging ? "grabbing" : "grab",
                        transition: isDragging ? "none" : "transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
                      }
                    : undefined
                }
                draggable={false}
                onLoad={() => setLoaded(true)}
              />

              {/* Badge indicando o zoom ativo e atalho para desativar */}
              {isZoomed && (
                <div
                  className={styles.zoomIndicatorBadge}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleZoom();
                  }}
                  title="Clique para voltar ao tamanho normal"
                >
                  <ZoomOut size={14} />
                  <span>2.2x • Arraste para mover • Clique para sair</span>
                </div>
              )}
            </div>

            {hasMultiple && (
              <button
                type="button"
                className={`${styles.airbnbNavArrow} ${styles.airbnbNavNext}`}
                onClick={(e) => {
                  e.stopPropagation();
                  goTo(currentIndex + 1);
                }}
                aria-label="Próxima foto"
                title="Próxima foto (Seta direita)"
              >
                <ChevronRight size={22} />
              </button>
            )}
          </main>

          {/* Rodapé com miniaturas e dados do anúncio */}
          <footer className={styles.carouselFooter}>
            <div className={styles.footerCaptionRow}>
              <div className={styles.propertyMeta}>
                <span className={styles.propertyTitle}>{title}</span>
                {location && <span className={styles.propertyLocation}> • {location}</span>}
              </div>

              {priceLabel && <span className={styles.priceHighlight}>{priceLabel}</span>}

              {listingId && (
                <Link href={`/imovel/${listingId}`} className={styles.linkToDetails} onClick={onClose}>
                  <span>Ver anúncio</span>
                  <ArrowUpRight size={15} />
                </Link>
              )}
            </div>

            {hasMultiple && (
              <div className={styles.thumbnailStrip} ref={thumbStripRef}>
                {images.map((img, i) => (
                  <button
                    key={img.id ?? img.url ?? i}
                    type="button"
                    className={`${styles.thumbnailBtn} ${i === currentIndex ? styles.thumbnailBtnActive : ""}`}
                    onClick={() => goTo(i)}
                    aria-label={`Ver foto ${i + 1}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.url} alt="" className={styles.thumbnailImg} loading="lazy" />
                  </button>
                ))}
              </div>
            )}
          </footer>
        </div>
      )}

      {/* ── MODO 2: GRADE COMPLETA DE FOTOS (AIRBNB PHOTO GRID) ── */}
      {viewMode === "grid" && (
        <div className={styles.gridContainer}>
          <div className={styles.gridContent}>
            <div className={styles.gridHeader}>
              <div className={styles.gridHeaderTopRow}>
                <button
                  type="button"
                  className={styles.gridCloseBtn}
                  onClick={onClose}
                  aria-label="Fechar galeria (Esc)"
                  title="Fechar galeria (Esc)"
                >
                  <X size={18} />
                  <span>Fechar galeria</span>
                </button>
              </div>
              <h2 className={styles.gridTitle}>Fotos de {title}</h2>
              {location && <p className={styles.gridSubtitle}>{location}</p>}
            </div>

            <div className={styles.photoGrid}>
              {images.map((img, i) => (
                <div
                  key={img.id ?? img.url ?? i}
                  className={`${styles.gridCard} ${i === 0 ? styles.gridCardFeatured : ""}`}
                  onClick={() => {
                    setCurrentIndex(i);
                    setViewMode("carousel");
                  }}
                  role="button"
                  tabIndex={0}
                  aria-label={`Abrir foto ${i + 1}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.url} alt={`${title} - Foto ${i + 1}`} className={styles.gridImg} loading="lazy" />
                  <div className={styles.gridOverlay}>
                    <span className={styles.gridIndex}>Foto {i + 1}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return createPortal(content, document.body);
}
