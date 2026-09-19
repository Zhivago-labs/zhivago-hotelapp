"use client";

import { useActionState, useState } from "react";
import {
  Home,
  Building2,
  Calendar,
  CalendarDays,
  KeyRound,
  FileText,
  Tag,
  Sparkles,
  MapPin,
  BedDouble,
  Bath,
  Car,
  Plus,
  Minus,
  Save,
  Check,
} from "lucide-react";
import { updateListingAction } from "@/lib/actions/listings";
import { AmenitiesSelector } from "./AmenitiesSelector";
import styles from "./ListingForm.module.css";

interface EditableListing {
  id: string;
  name: string;
  description: string | null;
  price: number;
  type: string;
  category: string;
  billingCycle: string | null;
  location: string;
  bedrooms: number;
  bathrooms: number;
  parking: number;
  amenities?: string | null;
}

export function EditListingForm({ listing }: { listing: EditableListing }) {
  const [state, formAction, pending] = useActionState(updateListingAction, undefined);

  // Estados estilo Airbnb
  const [type, setType] = useState<"casa" | "apartamento">(listing.type === "apartamento" ? "apartamento" : "casa");
  
  const initialModality =
    listing.category === "venda"
      ? "venda"
      : listing.billingCycle === "mês"
      ? "mensal"
      : "diaria";
  const [modality, setModality] = useState<"diaria" | "mensal" | "venda">(initialModality);

  const category = modality === "venda" ? "venda" : "aluguel";
  const billingCycle = modality === "diaria" ? "noite" : modality === "mensal" ? "mês" : "noite";

  // Características estilo Airbnb (contadores circulares)
  const [bedrooms, setBedrooms] = useState(listing.bedrooms ?? 0);
  const [bathrooms, setBathrooms] = useState(listing.bathrooms ?? 0);
  const [parking, setParking] = useState(listing.parking ?? 0);

  // Preço
  const [price, setPrice] = useState(String(listing.price ?? ""));

  return (
    <form action={formAction} className={styles.form}>
      <input type="hidden" name="id" value={listing.id} />
      <input type="hidden" name="category" value={category} />
      <input type="hidden" name="billingCycle" value={billingCycle} />
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="bedrooms" value={bedrooms} />
      <input type="hidden" name="bathrooms" value={bathrooms} />
      <input type="hidden" name="parking" value={parking} />

      {/* ── 1. TIPO DE ESPAÇO ── */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionIconWrap}>
            <Home size={22} />
          </div>
          <div>
            <h2 className={styles.sectionTitle}>Tipo do imóvel</h2>
            <p className={styles.sectionSubtitle}>Selecione a categoria principal do imóvel</p>
          </div>
        </div>

        <div className={styles.optionGrid}>
          <button
            type="button"
            className={`${styles.optionCard} ${type === "casa" ? styles.optionCardActive : ""}`}
            onClick={() => setType("casa")}
          >
            <div className={styles.optionCardHeader}>
              <Home size={26} className={styles.optionCardIcon} />
              {type === "casa" && (
                <span className={styles.optionCardCheck}>
                  <Check size={12} />
                </span>
              )}
            </div>
            <p className={styles.optionCardTitle}>Casa</p>
            <p className={styles.optionCardSubtitle}>Residências térreas, sobrados e casas de condomínio</p>
          </button>

          <button
            type="button"
            className={`${styles.optionCard} ${type === "apartamento" ? styles.optionCardActive : ""}`}
            onClick={() => setType("apartamento")}
          >
            <div className={styles.optionCardHeader}>
              <Building2 size={26} className={styles.optionCardIcon} />
              {type === "apartamento" && (
                <span className={styles.optionCardCheck}>
                  <Check size={12} />
                </span>
              )}
            </div>
            <p className={styles.optionCardTitle}>Apartamento</p>
            <p className={styles.optionCardSubtitle}>Flats, studios, coberturas e apartamentos residenciais</p>
          </button>
        </div>
      </section>

      {/* ── 2. MODALIDADE & COBRANÇA ── */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionIconWrap}>
            <Tag size={22} />
          </div>
          <div>
            <h2 className={styles.sectionTitle}>Objetivo da publicação</h2>
            <p className={styles.sectionSubtitle}>Aluguel por diária, contrato mensal ou venda</p>
          </div>
        </div>

        <div className={styles.optionGrid}>
          <button
            type="button"
            className={`${styles.optionCard} ${modality === "diaria" ? styles.optionCardActive : ""}`}
            onClick={() => setModality("diaria")}
          >
            <div className={styles.optionCardHeader}>
              <Calendar size={26} className={styles.optionCardIcon} />
              {modality === "diaria" && (
                <span className={styles.optionCardCheck}>
                  <Check size={12} />
                </span>
              )}
            </div>
            <p className={styles.optionCardTitle}>Aluguel por Diária</p>
            <p className={styles.optionCardSubtitle}>Hospedagens curtas e temporada cobradas por noite</p>
          </button>

          <button
            type="button"
            className={`${styles.optionCard} ${modality === "mensal" ? styles.optionCardActive : ""}`}
            onClick={() => setModality("mensal")}
          >
            <div className={styles.optionCardHeader}>
              <CalendarDays size={26} className={styles.optionCardIcon} />
              {modality === "mensal" && (
                <span className={styles.optionCardCheck}>
                  <Check size={12} />
                </span>
              )}
            </div>
            <p className={styles.optionCardTitle}>Aluguel Mensal</p>
            <p className={styles.optionCardSubtitle}>Contrato de locação estendido com cobrança mensal</p>
          </button>

          <button
            type="button"
            className={`${styles.optionCard} ${modality === "venda" ? styles.optionCardActive : ""}`}
            onClick={() => setModality("venda")}
          >
            <div className={styles.optionCardHeader}>
              <KeyRound size={26} className={styles.optionCardIcon} />
              {modality === "venda" && (
                <span className={styles.optionCardCheck}>
                  <Check size={12} />
                </span>
              )}
            </div>
            <p className={styles.optionCardTitle}>Venda do Imóvel</p>
            <p className={styles.optionCardSubtitle}>Comercialização direta para compradores interessados</p>
          </button>
        </div>
      </section>

      {/* ── 3. INFORMAÇÕES DO ANÚNCIO ── */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionIconWrap}>
            <FileText size={22} />
          </div>
          <div>
            <h2 className={styles.sectionTitle}>Título e descrição</h2>
            <p className={styles.sectionSubtitle}>Atualize o título principal e a descrição do imóvel</p>
          </div>
        </div>

        <label className={styles.label} htmlFor="name">
          <span>Título do anúncio *</span>
        </label>
        <input id="name" name="name" type="text" defaultValue={listing.name} required className={styles.input} />

        <label className={styles.label} htmlFor="description">
          <span>Descrição detalhada</span>
        </label>
        <textarea
          id="description"
          name="description"
          defaultValue={listing.description ?? ""}
          className={styles.textarea}
        />
      </section>

      {/* ── 4. PREÇO ── */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionIconWrap}>
            <Tag size={22} />
          </div>
          <div>
            <h2 className={styles.sectionTitle}>Preço do anúncio</h2>
            <p className={styles.sectionSubtitle}>Defina o valor cobrado pelo imóvel</p>
          </div>
        </div>

        <div className={styles.airbnbPriceHero}>
          <span className={styles.airbnbPriceSymbol}>R$</span>
          <input
            id="price"
            name="price"
            type="number"
            min="0"
            step="0.01"
            required
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className={styles.airbnbPriceInput}
          />
        </div>
      </section>

      {/* ── 5. LOCALIZAÇÃO ── */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionIconWrap}>
            <MapPin size={22} />
          </div>
          <div>
            <h2 className={styles.sectionTitle}>Localização</h2>
            <p className={styles.sectionSubtitle}>Endereço ou localização do imóvel</p>
          </div>
        </div>

        <label className={styles.label} htmlFor="location">
          <span>Localização *</span>
        </label>
        <input id="location" name="location" type="text" defaultValue={listing.location} required className={styles.input} />
      </section>

      {/* ── 6. CARACTERÍSTICAS COM STEPPERS ── */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionIconWrap}>
            <Sparkles size={22} />
          </div>
          <div>
            <h2 className={styles.sectionTitle}>Comodidades e capacidade</h2>
            <p className={styles.sectionSubtitle}>Quantidade de cômodos e vagas disponíveis</p>
          </div>
        </div>

        <div className={styles.airbnbSteppersList}>
          {/* Quartos */}
          <div className={styles.airbnbRow}>
            <div className={styles.airbnbRowLeft}>
              <div className={styles.airbnbRowIcon}>
                <BedDouble size={22} />
              </div>
              <div>
                <p className={styles.airbnbRowTitle}>Quartos</p>
                <p className={styles.airbnbRowSubtitle}>Quantos quartos os hóspedes podem utilizar?</p>
              </div>
            </div>
            <div className={styles.airbnbStepper}>
              <button
                type="button"
                className={styles.airbnbCircleBtn}
                onClick={() => setBedrooms(Math.max(0, bedrooms - 1))}
                disabled={bedrooms <= 0}
                aria-label="Diminuir quartos"
              >
                <Minus size={14} />
              </button>
              <span className={styles.airbnbValue}>{bedrooms}</span>
              <button
                type="button"
                className={styles.airbnbCircleBtn}
                onClick={() => setBedrooms(bedrooms + 1)}
                aria-label="Aumentar quartos"
              >
                <Plus size={14} />
              </button>
            </div>
          </div>

          {/* Banheiros */}
          <div className={styles.airbnbRow}>
            <div className={styles.airbnbRowLeft}>
              <div className={styles.airbnbRowIcon}>
                <Bath size={22} />
              </div>
              <div>
                <p className={styles.airbnbRowTitle}>Banheiros</p>
                <p className={styles.airbnbRowSubtitle}>Quantos banheiros e suítes estão disponíveis?</p>
              </div>
            </div>
            <div className={styles.airbnbStepper}>
              <button
                type="button"
                className={styles.airbnbCircleBtn}
                onClick={() => setBathrooms(Math.max(0, bathrooms - 1))}
                disabled={bathrooms <= 0}
                aria-label="Diminuir banheiros"
              >
                <Minus size={14} />
              </button>
              <span className={styles.airbnbValue}>{bathrooms}</span>
              <button
                type="button"
                className={styles.airbnbCircleBtn}
                onClick={() => setBathrooms(bathrooms + 1)}
                aria-label="Aumentar banheiros"
              >
                <Plus size={14} />
              </button>
            </div>
          </div>

          {/* Garagem / Vagas */}
          <div className={styles.airbnbRow}>
            <div className={styles.airbnbRowLeft}>
              <div className={styles.airbnbRowIcon}>
                <Car size={22} />
              </div>
              <div>
                <p className={styles.airbnbRowTitle}>Vagas de garagem</p>
                <p className={styles.airbnbRowSubtitle}>Vagas de estacionamento disponíveis</p>
              </div>
            </div>
            <div className={styles.airbnbStepper}>
              <button
                type="button"
                className={styles.airbnbCircleBtn}
                onClick={() => setParking(Math.max(0, parking - 1))}
                disabled={parking <= 0}
                aria-label="Diminuir vagas de garagem"
              >
                <Minus size={14} />
              </button>
              <span className={styles.airbnbValue}>{parking}</span>
              <button
                type="button"
                className={styles.airbnbCircleBtn}
                onClick={() => setParking(parking + 1)}
                aria-label="Aumentar vagas de garagem"
              >
                <Plus size={14} />
              </button>
            </div>
          </div>
        </div>

        <div style={{ marginTop: "24px", paddingTop: "24px", borderTop: "1px solid var(--border)" }}>
          <AmenitiesSelector initialValue={listing.amenities} />
        </div>
      </section>

      {state?.error && <p className={styles.error}>{state.error}</p>}

      <button type="submit" className={styles.button} disabled={pending}>
        <Save size={18} />
        <span>{pending ? "Salvando…" : "Salvar alterações"}</span>
      </button>
    </form>
  );
}
