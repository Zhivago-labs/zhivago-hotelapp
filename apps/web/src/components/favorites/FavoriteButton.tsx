"use client";

import { Heart } from "lucide-react";
import { useFavorites } from "./FavoritesContext";
import styles from "./FavoriteButton.module.css";

interface FavoriteButtonProps {
  listingId: string;
  size?: number;
  className?: string;
}

export function FavoriteButton({ listingId, size = 20, className = "" }: FavoriteButtonProps) {
  const { isFavorite, toggleFavorite } = useFavorites();
  const active = isFavorite(listingId);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    toggleFavorite(listingId);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={active ? "Remover dos favoritos" : "Salvar nos favoritos"}
      className={`${styles.button} ${active ? styles.active : ""} ${className}`}
    >
      <Heart
        size={size}
        className={active ? styles.heartFilled : styles.heartOutline}
      />
    </button>
  );
}
