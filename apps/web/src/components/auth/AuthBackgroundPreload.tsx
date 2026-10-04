"use client";

import { preload } from "react-dom";

// A imagem de fundo das telas de auth vem do CSS (background-image), que o navegador só descobre depois
// de baixar e aplicar o stylesheet. O preload coloca um <link rel="preload"> no <head> pra começar o
// download junto com o HTML. Precisa ser client component: chamado num server component o hint só vai
// pro payload RSC, não pro <head> do HTML. Os media queries batem com o breakpoint de 1024px do
// page.module.css, e o `type` faz navegadores sem AVIF ignorarem o preload (caem no WebP/JPEG do image-set).
export function AuthBackgroundPreload() {
  preload("/images/system/auth-bg-1920.avif", {
    as: "image",
    type: "image/avif",
    fetchPriority: "high",
    media: "(min-width: 1025px)",
  });
  preload("/images/system/auth-bg-1024.avif", {
    as: "image",
    type: "image/avif",
    fetchPriority: "high",
    media: "(max-width: 1024px)",
  });
  return null;
}
