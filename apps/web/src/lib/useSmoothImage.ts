"use client";

import { useEffect, useState } from "react";

/**
 * Cache por sessão das fotos já baixadas (ou em download). Uma mesma URL nunca é pedida duas vezes
 * pelo pré-carregamento, e quem pede uma URL já pronta recebe a resposta na hora.
 */
const preloads = new Map<string, Promise<void>>();

/**
 * Baixa e decodifica a foto em segundo plano. Resolve também em caso de erro: quem chama troca a
 * foto mesmo assim e deixa o `onError` do <img> cuidar do fallback.
 */
export function preloadImage(url: string | undefined): Promise<void> {
  if (!url || typeof window === "undefined") return Promise.resolve();
  const existing = preloads.get(url);
  if (existing) return existing;

  const promise = new Promise<void>((resolve) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      // decode() garante que a troca não pisca enquanto o navegador decodifica a imagem.
      img.decode().catch(() => {}).finally(() => resolve());
    };
    img.onerror = () => {
      preloads.delete(url); // permite tentar de novo depois
      resolve();
    };
    img.src = url;
  });
  preloads.set(url, promise);
  return promise;
}

/** Atraso antes de mostrar o indicador de carregamento — conexão rápida não chega a vê-lo. */
const SLOW_MS = 300;

/**
 * Troca de foto sem tela vazia: enquanto a foto pedida (`src`) baixa, continua mostrando a
 * anterior; só troca quando a nova está pronta. `loading` fica true se a espera passar de 300 ms.
 * As URLs de `neighbors` são pré-carregadas em segundo plano (ex.: foto anterior e próxima).
 * Passar `src` undefined zera o estado — a próxima foto pedida aparece direto, sem esperar.
 */
export function useSmoothImage(src: string | undefined, neighbors: (string | undefined)[] = []) {
  const [shown, setShown] = useState<string | undefined>(src);
  const [loading, setLoading] = useState(false);
  const [prevSrc, setPrevSrc] = useState(src);

  // Casos que não precisam esperar download são resolvidos já no render: foto zerada (src
  // undefined), primeira foto (nada pra manter na tela) ou volta pra foto que já está na tela
  // antes de a outra terminar de baixar.
  if (src !== prevSrc) {
    setPrevSrc(src);
    if (!src || !shown || src === shown) {
      setShown(src);
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!src || !shown || src === shown) return;

    let cancelled = false;
    const timer = setTimeout(() => {
      if (!cancelled) setLoading(true);
    }, SLOW_MS);

    preloadImage(src).then(() => {
      if (cancelled) return;
      clearTimeout(timer);
      setShown(src);
      setLoading(false);
    });

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // `shown` fica de fora de propósito: a troca é disparada só pela mudança da foto pedida.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  const neighborsKey = neighbors.filter(Boolean).join("|");
  useEffect(() => {
    if (!neighborsKey) return;
    // Espera a foto atual ter prioridade na conexão antes de puxar as vizinhas.
    const timer = setTimeout(() => {
      for (const url of neighborsKey.split("|")) void preloadImage(url);
    }, 150);
    return () => clearTimeout(timer);
  }, [neighborsKey]);

  return { shownSrc: shown ?? src, loading };
}
