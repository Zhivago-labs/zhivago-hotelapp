import { Waves, MapPin, KeyRound, Wifi, Dumbbell, Building2 } from "lucide-react";
import styles from "./ListingHighlights.module.css";

interface Props {
  location: string;
  amenities?: string | null;
}

function parseAmenities(amenities: string | null | undefined): string[] {
  if (!amenities) return [];
  try {
    if (amenities.startsWith("[")) return JSON.parse(amenities);
    return amenities.split(",").map((s) => s.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Destaques do anúncio (seção 88 da spec) — cada item só aparece se houver um dado real por
 * trás dele. Nada de estatísticas inventadas ("95% dos hóspedes...") ou comodidades que o
 * anunciante não marcou.
 */
export function ListingHighlights({ location, amenities }: Props) {
  const selected = parseAmenities(amenities);

  const items = [
    selected.includes("piscina") && {
      icon: Waves,
      title: "Piscina",
      subtitle: "Este imóvel conta com piscina.",
    },
    selected.includes("wifi") && {
      icon: Wifi,
      title: "Wi-Fi disponível",
      subtitle: "Internet sem fio no imóvel.",
    },
    selected.includes("academia") && {
      icon: Dumbbell,
      title: "Academia",
      subtitle: "Espaço com academia de ginástica.",
    },
    selected.includes("elevador") && {
      icon: Building2,
      title: "Elevador",
      subtitle: "Prédio com elevador.",
    },
    selected.includes("fechadura_eletronica") && {
      icon: KeyRound,
      title: "Fechadura eletrônica",
      subtitle: "Entrada com fechadura eletrônica.",
    },
  ].filter((item): item is { icon: typeof Waves; title: string; subtitle: string } => Boolean(item));

  // Localização sempre aparece — é o único destaque que não depende de comodidade marcada.
  items.unshift({
    icon: MapPin,
    title: `Localizado em ${location}`,
    subtitle: "Veja o mapa e a região no restante do anúncio.",
  });

  return (
    <div className={styles.container}>
      {items.map((item) => (
        <div className={styles.item} key={item.title}>
          <div className={styles.iconWrap}>
            <item.icon size={20} />
          </div>
          <div className={styles.content}>
            <h3 className={styles.title}>{item.title}</h3>
            <p className={styles.subtitle}>{item.subtitle}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
