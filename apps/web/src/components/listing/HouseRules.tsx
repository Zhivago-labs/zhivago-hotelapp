import {
  Clock,
  Users,
  ShieldAlert,
  FileText,
  Ban,
  Dog,
  Cigarette,
  VolumeX,
  ShieldCheck,
  Flame,
  Building,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import type { Listing } from "@zhivago/shared";
import styles from "./HouseRules.module.css";

interface Props {
  listing?: Partial<Listing>;
  maxGuests?: number;
}

export function HouseRules({ listing, maxGuests: legacyMaxGuests }: Props) {
  const checkIn = listing?.checkInTime ?? "15:00";
  const checkOut = listing?.checkOutTime ?? "11:00";
  const maxCapacity =
    listing?.customMaxGuests ??
    legacyMaxGuests ??
    (listing?.bedrooms ? listing.bedrooms * 2 : 2);

  // Parse das regras da casa em JSON
  let rulesObj: {
    allowPets?: boolean;
    allowSmoking?: boolean;
    allowParties?: boolean;
    quietHours?: string;
    customNotes?: string;
  } = {};

  if (listing?.houseRules) {
    try {
      rulesObj = typeof listing.houseRules === "string" ? JSON.parse(listing.houseRules) : listing.houseRules;
    } catch {
      rulesObj = {};
    }
  }

  // Parse dos itens de segurança em JSON
  let safetyObj: {
    externalCameras?: boolean;
    smokeAlarm?: boolean;
    fireExtinguisher?: boolean;
    doorman24h?: boolean;
    firstAidKit?: boolean;
  } = {};

  if (listing?.safetyItems) {
    try {
      safetyObj = typeof listing.safetyItems === "string" ? JSON.parse(listing.safetyItems) : listing.safetyItems;
    } catch {
      safetyObj = {};
    }
  }

  const cancellationPolicy = listing?.cancellationPolicy ?? "FLEXIBLE";

  return (
    <section className={styles.container}>
      <h2 className={styles.title}>O que você deve saber</h2>

      <div className={styles.grid}>
        {/* Regras da Casa */}
        <div className={styles.column}>
          <h3 className={styles.columnTitle}>Regras da casa</h3>

          <p className={styles.item}>
            <Clock size={16} className={styles.itemIcon} />
            <span>Check-in a partir das {checkIn}</span>
          </p>

          <p className={styles.item}>
            <Clock size={16} className={styles.itemIcon} />
            <span>Checkout antes das {checkOut}</span>
          </p>

          <p className={styles.item}>
            <Users size={16} className={styles.itemIcon} />
            <span>Máximo de {maxCapacity} hóspedes</span>
          </p>

          {/* Permissão de Pets */}
          <p className={styles.item}>
            <Dog size={16} className={styles.itemIcon} />
            <span>
              {rulesObj.allowPets === true
                ? "Permitido animais de estimação"
                : rulesObj.allowPets === false
                ? "Proibido animais de estimação"
                : "Consulte regras para animais de estimação"}
            </span>
          </p>

          {/* Fumo */}
          <p className={styles.item}>
            <Cigarette size={16} className={styles.itemIcon} />
            <span>
              {rulesObj.allowSmoking === true
                ? "Permitido fumar na propriedade"
                : "Proibido fumar no ambiente"}
            </span>
          </p>

          {/* Festas */}
          <p className={styles.item}>
            <Ban size={16} className={styles.itemIcon} />
            <span>
              {rulesObj.allowParties === true
                ? "Festas/Eventos permitidos com aviso prévio"
                : "Proibido festas ou eventos barulhentos"}
            </span>
          </p>

          {/* Horário de silêncio */}
          {rulesObj.quietHours && (
            <p className={styles.item}>
              <VolumeX size={16} className={styles.itemIcon} />
              <span>Horário de silêncio: {rulesObj.quietHours}</span>
            </p>
          )}

          {rulesObj.customNotes && (
            <p className={styles.itemCustomNote}>
              <span>"{rulesObj.customNotes}"</span>
            </p>
          )}
        </div>

        {/* Segurança e Propriedade */}
        <div className={styles.column}>
          <h3 className={styles.columnTitle}>Segurança e propriedade</h3>

          {safetyObj.externalCameras !== false && (
            <p className={styles.item}>
              <ShieldAlert size={16} className={styles.itemIcon} />
              <span>Câmeras de segurança na parte externa</span>
            </p>
          )}

          {safetyObj.smokeAlarm !== false && (
            <p className={styles.item}>
              <Flame size={16} className={styles.itemIcon} />
              <span>Alarme de fumaça instalado</span>
            </p>
          )}

          {safetyObj.fireExtinguisher !== false && (
            <p className={styles.item}>
              <ShieldCheck size={16} className={styles.itemIcon} />
              <span>Extintor de incêndio disponível</span>
            </p>
          )}

          {safetyObj.doorman24h !== false && (
            <p className={styles.item}>
              <Building size={16} className={styles.itemIcon} />
              <span>Portaria com controle de acesso 24h</span>
            </p>
          )}

          {safetyObj.firstAidKit && (
            <p className={styles.item}>
              <CheckCircle2 size={16} className={styles.itemIcon} />
              <span>Kit de primeiros socorros</span>
            </p>
          )}
        </div>

        {/* Política de Cancelamento */}
        <div className={styles.column}>
          <h3 className={styles.columnTitle}>Política de cancelamento</h3>
          <p className={styles.item}>
            <FileText size={16} className={styles.itemIcon} />
            <span style={{ fontWeight: 600, color: "var(--foreground)" }}>
              {cancellationPolicy === "FLEXIBLE"
                ? "Política Flexível"
                : cancellationPolicy === "MODERATE"
                ? "Política Moderada"
                : "Política Rigorosa"}
            </span>
          </p>
          <p className={styles.itemDescription}>
            {cancellationPolicy === "FLEXIBLE" && (
              <>
                Cancelamento grátis até 48 horas antes do check-in. Após este período, receba reembolso de 50% de todas as noites restantes.
              </>
            )}
            {cancellationPolicy === "MODERATE" && (
              <>
                Cancelamento grátis até 5 dias antes do check-in. Reembolso de 50% caso o cancelamento ocorra a menos de 5 dias do início da estadia.
              </>
            )}
            {cancellationPolicy === "STRICT" && (
              <>
                Reembolso de 50% para cancelamentos feitos até 7 dias antes do check-in. Não há reembolso para cancelamentos feitos após esse prazo.
              </>
            )}
          </p>
        </div>
      </div>
    </section>
  );
}
