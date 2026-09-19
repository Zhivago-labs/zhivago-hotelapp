"use client";

import { MapPin, Navigation } from "lucide-react";
import styles from "./PropertyMap.module.css";

interface PropertyMapProps {
  location: string;
}

export function PropertyMap({ location }: PropertyMapProps) {
  const encodedLocation = encodeURIComponent(location);
  const mapUrl = `https://maps.google.com/maps?q=${encodedLocation}&t=&z=14&ie=UTF8&iwloc=&output=embed`;

  return (
    <section className={styles.container}>
      <h2 className={styles.headerTitle}>Onde você estará</h2>
      <p className={styles.locationText}>
        <MapPin size={16} className={styles.pinIcon} />
        <span>{location}</span>
      </p>

      <div className={styles.mapWrap}>
        <iframe
          title={`Mapa de ${location}`}
          src={mapUrl}
          className={styles.mapIframe}
          loading="lazy"
          allowFullScreen
        />
        <div className={styles.mapBadge}>
          <Navigation size={14} />
          <span>Localização aproximada em {location}</span>
        </div>
      </div>
    </section>
  );
}
