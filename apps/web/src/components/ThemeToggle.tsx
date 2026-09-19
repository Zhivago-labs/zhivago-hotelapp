"use client";

import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";
import styles from "./ThemeToggle.module.css";

interface ThemeToggleProps {
  variant?: "button" | "menuItem";
  onToggle?: () => void;
}

export function ThemeToggle({ variant = "button", onToggle }: ThemeToggleProps) {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("zhivago_theme") as "light" | "dark" | null;
      const initial = stored || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
      document.documentElement.setAttribute("data-theme", initial);
      queueMicrotask(() => {
        setTheme(initial);
        setMounted(true);
      });
    } catch {
      queueMicrotask(() => {
        setMounted(true);
      });
    }
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === "light" ? "dark" : "light";
    setTheme(nextTheme);
    document.documentElement.setAttribute("data-theme", nextTheme);
    try {
      localStorage.setItem("zhivago_theme", nextTheme);
    } catch {
      // erro de escrita no storage
    }
    if (onToggle) onToggle();
  };

  if (!mounted) return null;

  if (variant === "menuItem") {
    const isDark = theme === "dark";
    return (
      <button
        type="button"
        onClick={toggleTheme}
        className={styles.menuItemButton}
        aria-label={isDark ? "Alternar para modo claro" : "Alternar para modo escuro"}
      >
        <div className={styles.menuItemLeft}>
          {isDark ? <Sun size={16} className={styles.sunIcon} /> : <Moon size={16} />}
          <span>{isDark ? "Modo Claro" : "Modo Escuro"}</span>
        </div>
        <span className={`${styles.switchBadge} ${isDark ? styles.switchBadgeActive : ""}`}>
          <span className={styles.switchDot} />
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={styles.button}
      aria-label={theme === "light" ? "Alternar para modo escuro" : "Alternar para modo claro"}
      title={theme === "light" ? "Modo Escuro" : "Modo Claro"}
    >
      {theme === "light" ? <Moon size={18} /> : <Sun size={18} className={styles.sunIcon} />}
    </button>
  );
}
