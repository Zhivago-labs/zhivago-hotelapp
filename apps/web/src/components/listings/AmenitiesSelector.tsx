"use client";

import { useState, useEffect } from "react";
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
  { id: "wifi", label: "Wi-Fi de alta velocidade", icon: Wifi },
  { id: "workspace", label: "Espaço de trabalho", icon: Briefcase },
  { id: "estacionamento", label: "Estacionamento no local", icon: Car },
  { id: "piscina", label: "Piscina e área de lazer", icon: Sun },
  { id: "tv", label: "TV Smart 4K", icon: Tv },
  { id: "ar_condicionado", label: "Ar-condicionado split", icon: Wind },
  { id: "cameras", label: "Câmeras de segurança", icon: ShieldCheck },
  { id: "maquina_lavar", label: "Máquina de lavar", icon: Shirt },
  { id: "cafeteira", label: "Cafeteira Nespresso", icon: Coffee },
  { id: "academia", label: "Academia de ginástica", icon: Dumbbell },
  { id: "elevador", label: "Elevador", icon: Building2 },
  { id: "pet_friendly", label: "Aceita pets", icon: Dog },
  { id: "fechadura_eletronica", label: "Fechadura eletrônica", icon: KeyRound },
];

interface Props {
  initialValue?: string | null;
  // Modo controlado: quando informados, o componente pai é a fonte da verdade da seleção
  // (necessário quando o pai precisa preservar o valor além do ciclo de vida deste componente,
  // como num wizard em que esta etapa é desmontada ao navegar para outra).
  value?: string[];
  onChange?: (next: string[]) => void;
}

export function AmenitiesSelector({ initialValue, value, onChange }: Props) {
  const [internalSelected, setInternalSelected] = useState<string[]>(() => {
    if (!initialValue) return ["cozinha", "wifi", "workspace", "estacionamento", "piscina", "tv", "ar_condicionado", "cameras"];
    try {
      if (initialValue.startsWith("[")) {
        return JSON.parse(initialValue);
      }
      return initialValue.split(",").map((s) => s.trim()).filter(Boolean);
    } catch {
      return ["cozinha", "wifi", "workspace", "estacionamento", "piscina", "tv", "ar_condicionado", "cameras"];
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
      <p className={styles.label}>O que esse lugar oferece? (Comodidades)</p>
      <p className={styles.hint}>Selecione todos os itens disponíveis para os hóspedes neste imóvel:</p>

      {/* No modo controlado, o input oculto que expõe o valor ao <form> vive no componente pai. */}
      {!isControlled && <input type="hidden" name="amenities" value={JSON.stringify(selected)} />}

      <div className={styles.grid}>
        {AVAILABLE_AMENITIES.map((item) => {
          const Icon = item.icon;
          const isSelected = selected.includes(item.id);
          return (
            <div
              key={item.id}
              className={`${styles.optionCard} ${isSelected ? styles.optionCardSelected : ""}`}
              onClick={() => toggleAmenity(item.id)}
            >
              <div className={styles.iconWrap}>
                {isSelected ? <Check size={18} style={{ color: "var(--accent)" }} /> : <Icon size={18} />}
              </div>
              <span className={styles.title}>{item.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
