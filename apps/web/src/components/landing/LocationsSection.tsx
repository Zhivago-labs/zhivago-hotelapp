import Link from "next/link";
import { MapPin } from "lucide-react";
import type { CitySummary } from "./home-data";
import shared from "./shared.module.css";
import styles from "./LocationsSection.module.css";

/** Cidades com imóveis publicados. Só renderiza com 2+ cidades — uma lista de uma cidade só não ajuda. */
export function LocationsSection({ cities }: { cities: CitySummary[] }) {
  if (cities.length < 2) return null;

  return (
    <section className={styles.section} aria-labelledby="locations-title">
      <div className={shared.wrap}>
        <h2 id="locations-title" className={shared.sectionTitle}>
          Encontre imóveis onde você quer morar
        </h2>
        <ul className={styles.list}>
          {cities.slice(0, 8).map((city) => (
            <li key={city.query}>
              <Link href={`/imoveis?q=${encodeURIComponent(city.query)}`} className={styles.city}>
                <MapPin size={16} aria-hidden="true" className={styles.icon} />
                <span className={styles.name}>{city.label}</span>
                <span className={styles.count}>
                  {city.count} {city.count === 1 ? "imóvel" : "imóveis"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
