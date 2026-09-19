import { Sun, MapPin, Key, Wifi, ShieldCheck } from "lucide-react";
import styles from "./ListingHighlights.module.css";

interface Props {
  hasPool?: boolean;
  location: string;
}

export function ListingHighlights({ location }: Props) {
  return (
    <div className={styles.container}>
      <div className={styles.item}>
        <div className={styles.iconWrap}>
          <Sun size={20} />
        </div>
        <div className={styles.content}>
          <h3 className={styles.title}>Comodidades e Lazer de Luxo</h3>
          <p className={styles.subtitle}>
            As estadias ficam ainda melhores com a piscina privativa, varanda com vista panorâmica e áreas de estar externas.
          </p>
        </div>
      </div>

      <div className={styles.item}>
        <div className={styles.iconWrap}>
          <MapPin size={20} />
        </div>
        <div className={styles.content}>
          <h3 className={styles.title}>Localização Privilegiada em {location}</h3>
          <p className={styles.subtitle}>
            95% dos hóspedes recentes deram 5 estrelas para a localização e facilidade de transporte no entorno.
          </p>
        </div>
      </div>

      <div className={styles.item}>
        <div className={styles.iconWrap}>
          <Key size={20} />
        </div>
        <div className={styles.content}>
          <h3 className={styles.title}>Check-in Autônomo e Descomplicado</h3>
          <p className={styles.subtitle}>
            Faça check-in sem filas nem burocracia com a portaria 24 horas e fechadura inteligente.
          </p>
        </div>
      </div>

      <div className={styles.item}>
        <div className={styles.iconWrap}>
          <Wifi size={20} />
        </div>
        <div className={styles.content}>
          <h3 className={styles.title}>Wi-Fi de Alta Velocidade</h3>
          <p className={styles.subtitle}>
            Internet de fibra ótica perfeita para streaming 4K, videochamadas de trabalho ou lazer.
          </p>
        </div>
      </div>
    </div>
  );
}
