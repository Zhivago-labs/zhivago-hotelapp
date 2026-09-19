"use client";

import { useEffect } from "react";
import { recordRecentlyViewed } from "@/lib/recent-activity";

// Componente invisível: só registra o imóvel como "visto recentemente" (localStorage)
// quando a página de detalhes monta. Fica em arquivo próprio porque a página de
// detalhes é Server Component e não pode chamar hooks diretamente.
export function RecordRecentView({ listingId }: { listingId: string }) {
  useEffect(() => {
    recordRecentlyViewed(listingId);
  }, [listingId]);

  return null;
}
