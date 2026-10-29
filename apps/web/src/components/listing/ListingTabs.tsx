"use client";

import { useState } from "react";
import styles from "./ListingTabs.module.css";

/** Abas da página do imóvel — cada uma rola até a seção correspondente (âncora `#id`). */
export function ListingTabs({ tabs }: { tabs: { id: string; label: string }[] }) {
  const [active, setActive] = useState(tabs[0]?.id);

  return (
    <nav className={styles.tabs} aria-label="Seções do anúncio">
      {tabs.map((tab) => (
        <a
          key={tab.id}
          href={`#${tab.id}`}
          className={`${styles.tab} ${active === tab.id ? styles.active : ""}`}
          onClick={() => setActive(tab.id)}
        >
          {tab.label}
        </a>
      ))}
    </nav>
  );
}
