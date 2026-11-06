import type { SyntheticEvent } from "react";

/**
 * Miniatura (480px, ~30 KB) de uma foto de anúncio, pra cards e listas. O backend grava
 * `<nome>.thumb.webp` ao lado de cada foto enviada; foto externa (importação por CSV) não tem
 * miniatura e volta como está.
 */
export function thumbnailUrl(url: string | undefined): string | undefined {
  if (!url || !url.includes("/uploads/") || !url.endsWith(".webp") || url.endsWith(".thumb.webp")) return url;
  return url.replace(/\.webp$/, ".thumb.webp");
}

/**
 * Props de <img> que usam a miniatura e caem pra foto original se ela não existir (upload antigo
 * ainda sem miniatura gerada).
 */
export function thumbnailImgProps(url: string | undefined, fallback = "/placeholder.jpg") {
  const original = url || fallback;
  return {
    src: thumbnailUrl(url) || fallback,
    onError: (event: SyntheticEvent<HTMLImageElement>) => {
      const img = event.currentTarget;
      if (img.getAttribute("src") !== original) img.src = original;
    },
  };
}
