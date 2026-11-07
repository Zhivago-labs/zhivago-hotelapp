"use client";

import { useId, useRef, useState, useEffect } from "react";
import { ImagePlus, X, Maximize2, ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import styles from "./MultiImageInput.module.css";

export function MultiImageInput({
  name = "images",
  onFilesChange,
  initialFiles,
}: {
  name?: string;
  onFilesChange?: (count: number, files: File[]) => void;
  initialFiles?: File[];
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>(initialFiles ?? []);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  // URLs de preview para as imagens selecionadas
  const [previewUrls, setPreviewUrls] = useState<string[]>(() => (initialFiles ?? []).map(file => URL.createObjectURL(file)));
  const [error, setError] = useState("");

  useEffect(() => {
    if (!initialFiles) return;
    const transfer = new DataTransfer();
    initialFiles.forEach(file => transfer.items.add(file));
    if (inputRef.current) inputRef.current.files = transfer.files;
  }, [initialFiles]);

  useEffect(() => {
    return () => {
      previewUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [previewUrls]);

  // Navegação por teclado (ESC para fechar, Setas Esquerda/Direita para trocar de foto)
  useEffect(() => {
    if (selectedIndex === null) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedIndex(null);
      if (e.key === "ArrowLeft") {
        setSelectedIndex((prev) => (prev !== null && prev > 0 ? prev - 1 : prev));
      }
      if (e.key === "ArrowRight") {
        setSelectedIndex((prev) => (prev !== null && prev < files.length - 1 ? prev + 1 : prev));
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedIndex, files.length]);

  const syncInput = (next: File[]) => {
    const dataTransfer = new DataTransfer();
    next.forEach((file) => dataTransfer.items.add(file));
    if (inputRef.current) inputRef.current.files = dataTransfer.files;
    setFiles(next);
    setPreviewUrls(next.map(file => URL.createObjectURL(file)));
    onFilesChange?.(next.length, next);
  };

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(event.target.files ?? []);
    if (files.length + picked.length > 10 || picked.some(file => file.size > 20 * 1024 * 1024 || !file.type.startsWith("image/"))) {
      setError("Selecione até 10 imagens, com no máximo 20 MB por arquivo.");
      syncInput(files);
      return;
    }
    setError("");
    syncInput([...files, ...picked]);
  };

  const handleRemove = (index: number, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const nextFiles = files.filter((_, i) => i !== index);
    syncInput(nextFiles);

    if (selectedIndex !== null) {
      if (nextFiles.length === 0) {
        setSelectedIndex(null);
      } else if (selectedIndex >= nextFiles.length) {
        setSelectedIndex(nextFiles.length - 1);
      }
    }
  };

  return (
    <div className={styles.wrap}>
      <p id="photos" tabIndex={-1}>Envie imagens (JPEG, PNG ou WebP, entre os formatos decodificados pelo servidor), até 20 MB cada e 10 fotos por anúncio. Para publicar, é necessária ao menos uma foto. A primeira será a capa. As fotos serão enviadas ao publicar.</p>
      {error && <p role="alert">{error}</p>}
      <input
        ref={inputRef}
        id={inputId}
        name={name}
        type="file"
        accept="image/*"
        multiple
        onChange={handleChange}
        className={styles.hiddenInput}
      />

      <div className={styles.grid}>
        {files.map((file, index) => (
          <div
            key={`${file.name}-${index}`}
            className={styles.thumb}
            onClick={() => setSelectedIndex(index)}
            title="Clique para ampliar esta foto"
            role="group"
            aria-label={`Foto ${index + 1}: ${file.name}`}
          >
            {previewUrls[index] && (
              // Local object URLs cannot be optimized by next/image.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrls[index]} alt={file.name} className={styles.thumbImage} />
            )}

            <div className={styles.thumbOverlay}>
              <Maximize2 size={16} />
              <span>Ampliar</span>
            </div>
            <div className={styles.photoActions}>
              <button type="button" onClick={e => { e.stopPropagation(); setSelectedIndex(index); }} aria-label={`Ampliar ${file.name}`}>Ampliar</button>
              <button type="button" onClick={e => { e.stopPropagation(); syncInput([file, ...files.filter((_, i) => i !== index)]); }} aria-label={`Usar ${file.name} como capa`}>{index === 0 ? "Capa" : "Usar como capa"}</button>
              {index > 0 && <button type="button" aria-label={`Mover ${file.name} para a esquerda`} onClick={e => { e.stopPropagation(); const next = [...files]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; syncInput(next); }}>← Mover</button>}
            </div>

            <button
              type="button"
              className={styles.removeButton}
              onClick={(e) => handleRemove(index, e)}
              aria-label={`Remover ${file.name}`}
              title="Remover foto"
            >
              <X size={14} />
            </button>
          </div>
        ))}

        <button type="button" onClick={() => inputRef.current?.click()} className={styles.addTile}>
          <ImagePlus size={24} />
          <span>Adicionar fotos</span>
        </button>
      </div>

      {/* ── LIGHTBOX MODAL DE VISUALIZAÇÃO AMPLIADA ── */}
      {selectedIndex !== null && files[selectedIndex] && (
        <div className={styles.lightboxOverlay} onClick={() => setSelectedIndex(null)}>
          <div className={styles.lightboxContent} onClick={(e) => e.stopPropagation()}>
            {/* Cabeçalho do modal */}
            <div className={styles.lightboxHeader}>
              <span className={styles.lightboxCounter}>
                Foto {selectedIndex + 1} de {files.length} — {files[selectedIndex].name}
              </span>

              <div className={styles.lightboxActions}>
                <button
                  type="button"
                  className={styles.lightboxRemoveBtn}
                  onClick={() => handleRemove(selectedIndex)}
                  title="Excluir esta foto"
                >
                  <Trash2 size={15} />
                  <span>Excluir foto</span>
                </button>
                <button
                  type="button"
                  className={styles.lightboxCloseBtn}
                  onClick={() => setSelectedIndex(null)}
                  title="Fechar (Esc)"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Imagem em alta resolução */}
            <div className={styles.lightboxImageWrap}>
              {selectedIndex > 0 && (
                <button
                  type="button"
                  className={`${styles.navBtn} ${styles.prevBtn}`}
                  onClick={() => setSelectedIndex(selectedIndex - 1)}
                  title="Foto anterior (Seta para esquerda)"
                >
                  <ChevronLeft size={24} />
                </button>
              )}

              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrls[selectedIndex]}
                alt={files[selectedIndex].name}
                className={styles.lightboxImage}
              />

              {selectedIndex < files.length - 1 && (
                <button
                  type="button"
                  className={`${styles.navBtn} ${styles.nextBtn}`}
                  onClick={() => setSelectedIndex(selectedIndex + 1)}
                  title="Próxima foto (Seta para direita)"
                >
                  <ChevronRight size={24} />
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
