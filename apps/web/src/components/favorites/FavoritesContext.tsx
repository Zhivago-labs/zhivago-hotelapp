"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";

interface FavoritesContextType {
  favorites: string[];
  isFavorite: (id: string) => boolean;
  toggleFavorite: (id: string) => void;
}

const FavoritesContext = createContext<FavoritesContextType | null>(null);

const STORAGE_KEY = "zhivago_favorites";

export function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const [favorites, setFavorites] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    let list: string[] = [];
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        list = JSON.parse(stored);
      }
    } catch {
      // erro de leitura de storage
    }

    queueMicrotask(() => {
      if (list.length > 0) setFavorites(list);
      setMounted(true);
    });
  }, []);

  const isFavorite = useCallback(
    (id: string) => {
      return favorites.includes(id);
    },
    [favorites]
  );

  const toggleFavorite = useCallback((id: string) => {
    setFavorites((prev) => {
      const next = prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id];
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // erro de escrita no storage
      }
      return next;
    });
  }, []);

  return (
    <FavoritesContext.Provider value={{ favorites: mounted ? favorites : [], isFavorite, toggleFavorite }}>
      {children}
    </FavoritesContext.Provider>
  );
}

export function useFavorites() {
  const context = useContext(FavoritesContext);
  if (!context) {
    throw new Error("useFavorites deve ser utilizado dentro de um FavoritesProvider");
  }
  return context;
}
