"use client";

import { useState } from "react";
import {
  ChefHat,
  Wifi,
  Briefcase,
  Car,
  Tv,
  Sun,
  ShieldCheck,
  Wind,
  Shirt,
  Coffee,
  Dumbbell,
  Building2,
  Dog,
  KeyRound,
  Check,
} from "lucide-react";
import styles from "./AmenitiesSelector.module.css";

export const AVAILABLE_AMENITIES = [
  { id: "cozinha", label: "Cozinha equipada", icon: ChefHat },
  { id: "wifi", label: "Wi-Fi", icon: Wifi },
  { id: "workspace", label: "Espaço de trabalho", icon: Briefcase },
  { id: "estacionamento", label: "Estacionamento no local", icon: Car },
  { id: "piscina", label: "Piscina e área de lazer", icon: Sun },
  { id: "tv", label: "Televisão", icon: Tv },
  { id: "ar_condicionado", label: "Ar-condicionado", icon: Wind },
  { id: "cameras", label: "Câmeras de segurança", icon: ShieldCheck },
  { id: "maquina_lavar", label: "Máquina de lavar", icon: Shirt },
  { id: "cafeteira", label: "Cafeteira", icon: Coffee },
  { id: "academia", label: "Academia de ginástica", icon: Dumbbell },
  { id: "elevador", label: "Elevador", icon: Building2 },
  { id: "pet_friendly", label: "Aceita pets", icon: Dog },
  { id: "fechadura_eletronica", label: "Fechadura eletrônica", icon: KeyRound },
];

interface Props {
  furnished?: boolean;
  modality?: string;
  initialValue?: string | null;
  // Modo controlado: quando informados, o componente pai é a fonte da verdade da seleção
  // (necessário quando o pai precisa preservar o valor além do ciclo de vida deste componente,
  // como num wizard em que esta etapa é desmontada ao navegar para outra).
  value?: string[];
  onChange?: (next: string[]) => void;
}

export function AmenitiesSelector({ initialValue, value, onChange, furnished = true, modality }: Props) {
  // Seção 61 da spec: nunca pré-selecionar comodidades que o anunciante não marcou de verdade.
  const [internalSelected, setInternalSelected] = useState<string[]>(() => {
    if (!initialValue) return [];
    try {
      if (initialValue.startsWith("[")) {
        return JSON.parse(initialValue);
      }
      return initialValue.split(",").map((s) => s.trim()).filter(Boolean);
    } catch {
      return [];
    }
  });

  const isControlled = value !== undefined;
  const selected = isControlled ? value : internalSelected;

  const toggleAmenity = (id: string) => {
    const next = selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id];
    if (isControlled) {
      onChange?.(next);
    } else {
      setInternalSelected(next);
    }
  };

  return (
    <div className={styles.container}>
      <p className={styles.label}>Características e comodidades do imóvel</p>
      <p className={styles.hint}>Selecione apenas os itens cuja disponibilidade você confirmou. Pets, vagas e câmeras são informados nas características e regras.</p>

      {/* No modo controlado, o input oculto que expõe o valor ao <form> vive no componente pai. */}
      {!isControlled && <input type="hidden" name="amenities" value={JSON.stringify(selected)} />}

      <div className={styles.grid}>
        {AVAILABLE_AMENITIES.filter((item) => (!modality || !["pet_friendly", "estacionamento", "cameras"].includes(item.id)) && (modality === "diaria" || furnished || !["wifi", "tv", "cafeteira", "maquina_lavar", "cozinha"].includes(item.id))).map((item) => {
          const Icon = item.icon;
          const isSelected = selected.includes(item.id);
          return (
            <label
              key={item.id}
              className={`${styles.optionCard} ${isSelected ? styles.optionCardSelected : ""}`}

            >
              <input type="checkbox" checked={isSelected} onChange={() => toggleAmenity(item.id)} />
              <div className={styles.iconWrap}>
                {isSelected ? <Check size={18} style={{ color: "var(--accent)" }} /> : <Icon size={18} />}
              </div>
              <span className={styles.title}>{item.label}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
