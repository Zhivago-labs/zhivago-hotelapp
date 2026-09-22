"use client";

import { useActionState, useMemo, useState } from "react";
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
  DoorClosed,
  Ruler,
  ShieldCheck,
  Users,
  Plus,
  Minus,
  Save,
  Check,
} from "lucide-react";
import type { Listing, ListingOperationType } from "@zhivago/shared";
import type { MyOrganization } from "@/lib/organizations-api";
import { createOrganizationBuildingAction, type CreateBuildingState } from "@/lib/actions/organizations";
import { updateListingAction } from "@/lib/actions/listings";
import { AmenitiesSelector } from "./AmenitiesSelector";
import styles from "./ListingForm.module.css";

type Modality = "diaria" | "mensal" | "venda";
type BuildingOption = { id: string; name: string; address: string | null };

const GUARANTEE_OPTIONS = [
  { value: "CAUCAO", label: "Caução" },
  { value: "SEGURO_FIANCA", label: "Seguro-fiança" },
  { value: "FIADOR", label: "Fiador" },
] as const;

function operationTypeToModality(operationType: ListingOperationType): Modality {
  if (operationType === "SALE") return "venda";
  if (operationType === "MONTHLY_RENT") return "mensal";
  return "diaria";
}

function parseJsonArray(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseHouseRules(value: string | null | undefined) {
  try {
    return value ? JSON.parse(value) : {};
  } catch {
    return {};
  }
}

function parseSafetyItems(value: string | null | undefined) {
  try {
    return value ? JSON.parse(value) : {};
  } catch {
    return {};
  }
}

/** Mini-formulário "+ Novo empreendimento" (seção 63 da spec) — igual ao usado no cadastro. */
function NewBuildingInlineForm({ onCreated, onCancel }: { onCreated: (b: BuildingOption) => void; onCancel: () => void }) {
  const [state, formAction, pending] = useActionState<CreateBuildingState, FormData>(createOrganizationBuildingAction, undefined);

  if (state && "building" in state) {
    onCreated(state.building);
  }

  return (
    <form action={formAction} className={styles.row} style={{ marginTop: "12px", alignItems: "flex-end" }}>
      <div>
        <label className={styles.label} htmlFor="editNewBuildingName">
          <span>Nome do empreendimento</span>
        </label>
        <input id="editNewBuildingName" name="name" type="text" placeholder="Ex: Unique Tower" required className={styles.input} />
      </div>
      <div>
        <label className={styles.label} htmlFor="editNewBuildingAddress">
          <span>Endereço (opcional)</span>
        </label>
        <input id="editNewBuildingAddress" name="address" type="text" className={styles.input} />
      </div>
      <div style={{ display: "flex", gap: "8px" }}>
        <button type="submit" className={styles.secondaryButton} disabled={pending}>
          {pending ? "Criando…" : "Criar"}
        </button>
        <button type="button" className={styles.secondaryButton} onClick={onCancel}>
          Cancelar
        </button>
      </div>
      {state && "error" in state && <p className={styles.error}>{state.error}</p>}
    </form>
  );
}

export function EditListingForm({
  listing,
  myOrg,
  buildings,
}: {
  listing: Listing;
  myOrg: MyOrganization | null;
  buildings: BuildingOption[];
}) {
  const [state, formAction, pending] = useActionState(updateListingAction, undefined);

  const [type, setType] = useState<"casa" | "apartamento">(listing.type === "apartamento" ? "apartamento" : "casa");
  const initialModality = operationTypeToModality(listing.operationType);
  const [modality, setModality] = useState<Modality>(initialModality);
  const category = modality === "venda" ? "venda" : "aluguel";
  const billingCycle = modality === "diaria" ? "noite" : modality === "mensal" ? "mês" : "noite";
  const operationType: ListingOperationType = modality === "venda" ? "SALE" : modality === "mensal" ? "MONTHLY_RENT" : "DAILY_RENT";
  const modalityChanged = modality !== initialModality;

  const isOrg = !!myOrg;

  const [name, setName] = useState(listing.name);
  const [description, setDescription] = useState(listing.description ?? "");
  const [price, setPrice] = useState(String(listing.price ?? ""));

  const [bedrooms, setBedrooms] = useState(listing.bedrooms ?? 0);
  const [suites, setSuites] = useState(listing.suites ?? 0);
  const [bathrooms, setBathrooms] = useState(listing.bathrooms ?? 0);
  const [parking, setParking] = useState(listing.parking ?? 0);
  const [privateArea, setPrivateArea] = useState(listing.privateArea != null ? String(listing.privateArea) : "");
  const [totalArea, setTotalArea] = useState(listing.totalArea != null ? String(listing.totalArea) : "");

  const [cep, setCep] = useState(listing.cep ?? "");
  const [logradouro, setLogradouro] = useState(listing.logradouro ?? "");
  const [numero, setNumero] = useState(listing.numero ?? "");
  const [complemento, setComplemento] = useState(listing.complemento ?? "");
  const [bairro, setBairro] = useState(listing.bairro ?? "");
  const [cidade, setCidade] = useState(listing.cidade ?? "");
  const [uf, setUf] = useState(listing.uf ?? "");

  // Diária
  const initialHouseRules = parseHouseRules(listing.houseRules);
  const initialSafetyItems = parseSafetyItems(listing.safetyItems);
  const [checkInTime, setCheckInTime] = useState(listing.checkInTime ?? "15:00");
  const [checkOutTime, setCheckOutTime] = useState(listing.checkOutTime ?? "11:00");
  const [customMaxGuests, setCustomMaxGuests] = useState(listing.customMaxGuests ?? 2);
  const [minimumNights, setMinimumNights] = useState(listing.minimumNights != null ? String(listing.minimumNights) : "1");
  const [cleaningFee, setCleaningFee] = useState(listing.cleaningFee != null ? String(listing.cleaningFee) : "");
  const [allowPetsDaily, setAllowPetsDaily] = useState(initialHouseRules.allowPets ?? true);
  const [allowSmoking, setAllowSmoking] = useState(initialHouseRules.allowSmoking ?? false);
  const [allowParties, setAllowParties] = useState(initialHouseRules.allowParties ?? false);
  const [quietHours, setQuietHours] = useState(initialHouseRules.quietHours ?? "22:00 às 08:00");
  const [customNotes, setCustomNotes] = useState(initialHouseRules.customNotes ?? "");
  const [externalCameras, setExternalCameras] = useState(initialSafetyItems.externalCameras ?? true);
  const [smokeAlarm, setSmokeAlarm] = useState(initialSafetyItems.smokeAlarm ?? true);
  const [fireExtinguisher, setFireExtinguisher] = useState(initialSafetyItems.fireExtinguisher ?? true);
  const [doorman24h, setDoorman24h] = useState(initialSafetyItems.doorman24h ?? false);
  const [firstAidKit, setFirstAidKit] = useState(initialSafetyItems.firstAidKit ?? false);
  const [cancellationPolicy, setCancellationPolicy] = useState<"FLEXIBLE" | "MODERATE" | "STRICT">(
    (listing.cancellationPolicy as "FLEXIBLE" | "MODERATE" | "STRICT") ?? "FLEXIBLE"
  );

  // Venda
  const [condoFee, setCondoFee] = useState(listing.condoFee != null ? String(listing.condoFee) : "");
  const [iptuAnnual, setIptuAnnual] = useState(listing.iptuAnnual != null ? String(listing.iptuAnnual) : "");
  const [acceptsFinancing, setAcceptsFinancing] = useState(listing.acceptsFinancing ?? false);
  const [acceptsExchange, setAcceptsExchange] = useState(listing.acceptsExchange ?? false);

  // Mensal
  const [iptuMonthly, setIptuMonthly] = useState(listing.iptuMonthly != null ? String(listing.iptuMonthly) : "");
  const [availableFrom, setAvailableFrom] = useState(listing.availableFrom ? listing.availableFrom.slice(0, 10) : "");
  const [minimumLeaseMonths, setMinimumLeaseMonths] = useState(
    listing.minimumLeaseMonths != null ? String(listing.minimumLeaseMonths) : ""
  );
  const [guaranteeTypes, setGuaranteeTypes] = useState<string[]>(parseJsonArray(listing.guaranteeTypes));
  const [isFurnished, setIsFurnished] = useState(listing.isFurnished ?? false);
  const [allowPetsMonthly, setAllowPetsMonthly] = useState(listing.allowPets ?? true);

  const toggleGuaranteeType = (value: string) => {
    setGuaranteeTypes((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
  };

  // Empreendimento + Atendimento/CRM
  const [buildingOptions, setBuildingOptions] = useState<BuildingOption[]>(buildings);
  const [buildingId, setBuildingId] = useState(listing.buildingId ?? "");
  const [showNewBuildingForm, setShowNewBuildingForm] = useState(false);
  const [hasSpecificAgent, setHasSpecificAgent] = useState(!!listing.agentId);
  const [assignedAgentId, setAssignedAgentId] = useState(listing.agentId ?? "");
  const [assumeBuildingLeads, setAssumeBuildingLeads] = useState(false);
  const activeMembers = useMemo(
    () => (myOrg?.organization.members ?? []).filter((m) => m.status === "ACTIVE"),
    [myOrg]
  );

  const [amenities, setAmenities] = useState<string[]>(() => {
    try {
      return listing.amenities ? JSON.parse(listing.amenities) : [];
    } catch {
      return [];
    }
  });

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    // Seção 81 da spec: trocar de modalidade descarta configurações exclusivas da anterior —
    // avisa antes de salvar.
    if (modalityChanged) {
      const confirmed = window.confirm(
        "A mudança de modalidade removerá configurações exclusivas da modalidade anterior. Continuar?"
      );
      if (!confirmed) {
        event.preventDefault();
      }
    }
  };

  return (
    <form action={formAction} onSubmit={handleSubmit} className={styles.form}>
      <input type="hidden" name="id" value={listing.id} />
      <input type="hidden" name="category" value={category} />
      <input type="hidden" name="billingCycle" value={billingCycle} />
      <input type="hidden" name="operationType" value={operationType} />
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="bedrooms" value={bedrooms} />
      <input type="hidden" name="suites" value={suites} />
      <input type="hidden" name="bathrooms" value={bathrooms} />
      <input type="hidden" name="parking" value={parking} />
      <input type="hidden" name="privateArea" value={privateArea} />
      <input type="hidden" name="totalArea" value={totalArea} />
      <input type="hidden" name="checkInTime" value={checkInTime} />
      <input type="hidden" name="checkOutTime" value={checkOutTime} />
      <input type="hidden" name="customMaxGuests" value={customMaxGuests} />
      <input type="hidden" name="minimumNights" value={minimumNights} />
      <input type="hidden" name="cleaningFee" value={cleaningFee} />
      <input
        type="hidden"
        name="houseRules"
        value={JSON.stringify({ allowPets: allowPetsDaily, allowSmoking, allowParties, quietHours, customNotes })}
      />
      <input
        type="hidden"
        name="safetyItems"
        value={JSON.stringify({ externalCameras, smokeAlarm, fireExtinguisher, doorman24h, firstAidKit })}
      />
      <input type="hidden" name="cancellationPolicy" value={cancellationPolicy} />
      <input type="hidden" name="condoFee" value={condoFee} />
      <input type="hidden" name="iptuAnnual" value={iptuAnnual} />
      <input type="hidden" name="acceptsFinancing" value={String(acceptsFinancing)} />
      <input type="hidden" name="acceptsExchange" value={String(acceptsExchange)} />
      <input type="hidden" name="iptuMonthly" value={iptuMonthly} />
      <input type="hidden" name="availableFrom" value={availableFrom} />
      <input type="hidden" name="minimumLeaseMonths" value={minimumLeaseMonths} />
      <input type="hidden" name="guaranteeTypes" value={JSON.stringify(guaranteeTypes)} />
      <input type="hidden" name="isFurnished" value={String(isFurnished)} />
      <input type="hidden" name="allowPets" value={String(allowPetsMonthly)} />
      <input type="hidden" name="hasOrgCrmStep" value={String(isOrg)} />
      <input type="hidden" name="buildingId" value={buildingId} />
      <input type="hidden" name="assumeBuildingLeads" value={String(assumeBuildingLeads)} />
      <input type="hidden" name="assignedAgentId" value={hasSpecificAgent ? assignedAgentId : ""} />
      <input type="hidden" name="cep" value={cep} />
      <input type="hidden" name="logradouro" value={logradouro} />
      <input type="hidden" name="numero" value={numero} />
      <input type="hidden" name="complemento" value={complemento} />
      <input type="hidden" name="bairro" value={bairro} />
      <input type="hidden" name="cidade" value={cidade} />
      <input type="hidden" name="uf" value={uf} />
      <input type="hidden" name="amenities" value={JSON.stringify(amenities)} />

      {/* ── TIPO DO IMÓVEL & MODALIDADE ── */}
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

        {modalityChanged && (
          <p className={styles.error} style={{ marginBottom: "12px" }}>
            Atenção: mudar a modalidade remove as configurações exclusivas da modalidade anterior ao salvar.
          </p>
        )}

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

      {/* ── TÍTULO & DESCRIÇÃO ── */}
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
        <input id="name" type="text" value={name} onChange={(e) => setName(e.target.value)} required className={styles.input} />

        <label className={styles.label} htmlFor="description">
          <span>Descrição detalhada</span>
        </label>
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className={styles.textarea}
        />
      </section>

      {/* ── PREÇO ── */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionIconWrap}>
            <Tag size={22} />
          </div>
          <div>
            <h2 className={styles.sectionTitle}>
              {modality === "diaria" ? "Preço por noite" : modality === "mensal" ? "Preço mensal" : "Preço de venda"}
            </h2>
            <p className={styles.sectionSubtitle}>Defina o valor cobrado pelo imóvel</p>
          </div>
        </div>

        <div className={styles.airbnbPriceHero}>
          <span className={styles.airbnbPriceSymbol}>R$</span>
          <input
            id="price"
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

      {/* ── LOCALIZAÇÃO ── */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionIconWrap}>
            <MapPin size={22} />
          </div>
          <div>
            <h2 className={styles.sectionTitle}>Localização</h2>
            <p className={styles.sectionSubtitle}>Endereço estruturado do imóvel</p>
          </div>
        </div>

        <div className={styles.row}>
          <div>
            <label className={styles.label} htmlFor="cep">
              <span>CEP</span>
            </label>
            <input id="cep" type="text" maxLength={9} value={cep} onChange={(e) => setCep(e.target.value)} className={styles.input} />
          </div>
          <div style={{ gridColumn: "span 2" }}>
            <label className={styles.label} htmlFor="logradouro">
              <span>Logradouro / Rua</span>
            </label>
            <input
              id="logradouro"
              type="text"
              value={logradouro}
              onChange={(e) => setLogradouro(e.target.value)}
              className={styles.input}
            />
          </div>
        </div>

        <div className={styles.row} style={{ marginTop: "16px" }}>
          <div>
            <label className={styles.label} htmlFor="numero">
              <span>Número</span>
            </label>
            <input id="numero" type="text" value={numero} onChange={(e) => setNumero(e.target.value)} className={styles.input} />
          </div>
          <div>
            <label className={styles.label} htmlFor="complemento">
              <span>Complemento</span>
            </label>
            <input
              id="complemento"
              type="text"
              value={complemento}
              onChange={(e) => setComplemento(e.target.value)}
              className={styles.input}
            />
          </div>
        </div>

        <div className={styles.row} style={{ marginTop: "16px" }}>
          <div>
            <label className={styles.label} htmlFor="bairro">
              <span>Bairro</span>
            </label>
            <input id="bairro" type="text" value={bairro} onChange={(e) => setBairro(e.target.value)} className={styles.input} />
          </div>
          <div>
            <label className={styles.label} htmlFor="cidade">
              <span>Cidade *</span>
            </label>
            <input id="cidade" type="text" required value={cidade} onChange={(e) => setCidade(e.target.value)} className={styles.input} />
          </div>
          <div>
            <label className={styles.label} htmlFor="uf">
              <span>UF *</span>
            </label>
            <input
              id="uf"
              type="text"
              maxLength={2}
              required
              value={uf}
              onChange={(e) => setUf(e.target.value.toUpperCase())}
              className={styles.input}
            />
          </div>
        </div>

        {isOrg && (
          <div style={{ marginTop: "20px", paddingTop: "20px", borderTop: "1px solid var(--border)" }}>
            <label className={styles.label} htmlFor="buildingSelect">
              <span>Empreendimento (opcional)</span>
            </label>
            <select id="buildingSelect" value={buildingId} onChange={(e) => setBuildingId(e.target.value)} className={styles.input}>
              <option value="">Nenhum</option>
              {buildingOptions.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>

            {!showNewBuildingForm ? (
              <button
                type="button"
                className={styles.secondaryButton}
                style={{ marginTop: "12px" }}
                onClick={() => setShowNewBuildingForm(true)}
              >
                <Plus size={16} />
                <span>Novo empreendimento</span>
              </button>
            ) : (
              <NewBuildingInlineForm
                onCreated={(b) => {
                  setBuildingOptions((prev) => [...prev, b]);
                  setBuildingId(b.id);
                  setShowNewBuildingForm(false);
                }}
                onCancel={() => setShowNewBuildingForm(false)}
              />
            )}
          </div>
        )}
      </section>

      {/* ── CONDIÇÕES POR MODALIDADE ── */}
      {modality === "venda" && (
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionIconWrap}>
              <Ruler size={22} />
            </div>
            <div>
              <h2 className={styles.sectionTitle}>Condições da venda</h2>
              <p className={styles.sectionSubtitle}>Condomínio, IPTU, financiamento e permuta</p>
            </div>
          </div>

          <div className={styles.row}>
            <div>
              <label className={styles.label} htmlFor="condoFeeSale">
                <span>Condomínio (R$/mês)</span>
              </label>
              <input
                id="condoFeeSale"
                type="number"
                min="0"
                step="0.01"
                value={condoFee}
                onChange={(e) => setCondoFee(e.target.value)}
                className={styles.input}
              />
            </div>
            <div>
              <label className={styles.label} htmlFor="iptuAnnual">
                <span>IPTU (R$/ano)</span>
              </label>
              <input
                id="iptuAnnual"
                type="number"
                min="0"
                step="0.01"
                value={iptuAnnual}
                onChange={(e) => setIptuAnnual(e.target.value)}
                className={styles.input}
              />
            </div>
          </div>

          <div className={styles.toggleGrid} style={{ marginTop: "16px" }}>
            <label className={styles.toggleItem}>
              <input type="checkbox" checked={acceptsFinancing} onChange={(e) => setAcceptsFinancing(e.target.checked)} />
              <span>Aceita financiamento</span>
            </label>
            <label className={styles.toggleItem}>
              <input type="checkbox" checked={acceptsExchange} onChange={(e) => setAcceptsExchange(e.target.checked)} />
              <span>Aceita permuta</span>
            </label>
          </div>
        </section>
      )}

      {modality === "mensal" && (
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionIconWrap}>
              <CalendarDays size={22} />
            </div>
            <div>
              <h2 className={styles.sectionTitle}>Condições do aluguel mensal</h2>
              <p className={styles.sectionSubtitle}>Condomínio, IPTU, disponibilidade e garantias</p>
            </div>
          </div>

          <div className={styles.row}>
            <div>
              <label className={styles.label} htmlFor="condoFeeMonthly">
                <span>Condomínio (R$/mês)</span>
              </label>
              <input
                id="condoFeeMonthly"
                type="number"
                min="0"
                step="0.01"
                value={condoFee}
                onChange={(e) => setCondoFee(e.target.value)}
                className={styles.input}
              />
            </div>
            <div>
              <label className={styles.label} htmlFor="iptuMonthly">
                <span>IPTU (R$/mês)</span>
              </label>
              <input
                id="iptuMonthly"
                type="number"
                min="0"
                step="0.01"
                value={iptuMonthly}
                onChange={(e) => setIptuMonthly(e.target.value)}
                className={styles.input}
              />
            </div>
          </div>

          <div className={styles.row} style={{ marginTop: "16px" }}>
            <div>
              <label className={styles.label} htmlFor="availableFrom">
                <span>Disponível a partir de</span>
              </label>
              <input
                id="availableFrom"
                type="date"
                value={availableFrom}
                onChange={(e) => setAvailableFrom(e.target.value)}
                className={styles.input}
              />
            </div>
            <div>
              <label className={styles.label} htmlFor="minimumLeaseMonths">
                <span>Prazo mínimo (meses)</span>
              </label>
              <input
                id="minimumLeaseMonths"
                type="number"
                min="0"
                value={minimumLeaseMonths}
                onChange={(e) => setMinimumLeaseMonths(e.target.value)}
                className={styles.input}
              />
            </div>
          </div>

          <div style={{ marginTop: "20px" }}>
            <h3 className={styles.airbnbSubHeading}>Garantias aceitas</h3>
            <div className={styles.toggleGrid}>
              {GUARANTEE_OPTIONS.map((opt) => (
                <label key={opt.value} className={styles.toggleItem}>
                  <input
                    type="checkbox"
                    checked={guaranteeTypes.includes(opt.value)}
                    onChange={() => toggleGuaranteeType(opt.value)}
                  />
                  <span>{opt.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className={styles.toggleGrid} style={{ marginTop: "16px" }}>
            <label className={styles.toggleItem}>
              <input type="checkbox" checked={isFurnished} onChange={(e) => setIsFurnished(e.target.checked)} />
              <span>Mobiliado</span>
            </label>
            <label className={styles.toggleItem}>
              <input type="checkbox" checked={allowPetsMonthly} onChange={(e) => setAllowPetsMonthly(e.target.checked)} />
              <span>Aceita animais de estimação</span>
            </label>
          </div>
        </section>
      )}

      {modality === "diaria" && (
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionIconWrap}>
              <ShieldCheck size={22} />
            </div>
            <div>
              <h2 className={styles.sectionTitle}>Regras da acomodação & Segurança</h2>
              <p className={styles.sectionSubtitle}>Horários, restrições e políticas de cancelamento</p>
            </div>
          </div>

          <div className={styles.row}>
            <div>
              <label className={styles.label} htmlFor="checkInTime">Check-in a partir das</label>
              <input
                id="checkInTime"
                type="time"
                value={checkInTime}
                onChange={(e) => setCheckInTime(e.target.value)}
                className={styles.input}
              />
            </div>
            <div>
              <label className={styles.label} htmlFor="checkOutTime">Checkout antes das</label>
              <input
                id="checkOutTime"
                type="time"
                value={checkOutTime}
                onChange={(e) => setCheckOutTime(e.target.value)}
                className={styles.input}
              />
            </div>
          </div>

          <div className={styles.row} style={{ marginTop: "16px" }}>
            <div>
              <label className={styles.label} htmlFor="customMaxGuests">Máximo de Hóspedes</label>
              <input
                id="customMaxGuests"
                type="number"
                min="1"
                max="50"
                value={customMaxGuests}
                onChange={(e) => setCustomMaxGuests(Number(e.target.value))}
                className={styles.input}
              />
            </div>
            <div>
              <label className={styles.label} htmlFor="minimumNights">Estadia mínima (noites)</label>
              <input
                id="minimumNights"
                type="number"
                min="1"
                value={minimumNights}
                onChange={(e) => setMinimumNights(e.target.value)}
                className={styles.input}
              />
            </div>
          </div>

          <div style={{ marginTop: "16px" }}>
            <label className={styles.label} htmlFor="cleaningFee">Taxa de limpeza (R$)</label>
            <input
              id="cleaningFee"
              type="number"
              min="0"
              step="0.01"
              value={cleaningFee}
              onChange={(e) => setCleaningFee(e.target.value)}
              className={styles.input}
            />
          </div>

          <div style={{ marginTop: "24px", paddingTop: "20px", borderTop: "1px solid var(--border)" }}>
            <h3 className={styles.airbnbSubHeading}>Regras da Acomodação</h3>
            <div className={styles.toggleGrid}>
              <label className={styles.toggleItem}>
                <input type="checkbox" checked={allowPetsDaily} onChange={(e) => setAllowPetsDaily(e.target.checked)} />
                <span>Animais de estimação permitidos</span>
              </label>
              <label className={styles.toggleItem}>
                <input type="checkbox" checked={allowSmoking} onChange={(e) => setAllowSmoking(e.target.checked)} />
                <span>Permitido fumar</span>
              </label>
              <label className={styles.toggleItem}>
                <input type="checkbox" checked={allowParties} onChange={(e) => setAllowParties(e.target.checked)} />
                <span>Eventos / Festas permitidos</span>
              </label>
            </div>
          </div>

          <div className={styles.row} style={{ marginTop: "16px" }}>
            <div>
              <label className={styles.label} htmlFor="quietHours">Horário de Silêncio</label>
              <input
                id="quietHours"
                type="text"
                value={quietHours}
                onChange={(e) => setQuietHours(e.target.value)}
                className={styles.input}
              />
            </div>
            <div>
              <label className={styles.label} htmlFor="customNotes">Observação Adicional</label>
              <input
                id="customNotes"
                type="text"
                value={customNotes}
                onChange={(e) => setCustomNotes(e.target.value)}
                className={styles.input}
              />
            </div>
          </div>

          <div style={{ marginTop: "24px", paddingTop: "20px", borderTop: "1px solid var(--border)" }}>
            <h3 className={styles.airbnbSubHeading}>Segurança & Proteção</h3>
            <div className={styles.toggleGrid}>
              <label className={styles.toggleItem}>
                <input type="checkbox" checked={externalCameras} onChange={(e) => setExternalCameras(e.target.checked)} />
                <span>Câmeras externas</span>
              </label>
              <label className={styles.toggleItem}>
                <input type="checkbox" checked={smokeAlarm} onChange={(e) => setSmokeAlarm(e.target.checked)} />
                <span>Alarme de fumaça</span>
              </label>
              <label className={styles.toggleItem}>
                <input type="checkbox" checked={fireExtinguisher} onChange={(e) => setFireExtinguisher(e.target.checked)} />
                <span>Extintor de incêndio</span>
              </label>
              <label className={styles.toggleItem}>
                <input type="checkbox" checked={doorman24h} onChange={(e) => setDoorman24h(e.target.checked)} />
                <span>Portaria 24h</span>
              </label>
              <label className={styles.toggleItem}>
                <input type="checkbox" checked={firstAidKit} onChange={(e) => setFirstAidKit(e.target.checked)} />
                <span>Kit primeiros socorros</span>
              </label>
            </div>
          </div>

          <div style={{ marginTop: "24px", paddingTop: "20px", borderTop: "1px solid var(--border)" }}>
            <h3 className={styles.airbnbSubHeading}>Política de Cancelamento</h3>
            <div className={styles.optionGrid}>
              <button
                type="button"
                className={`${styles.optionCard} ${cancellationPolicy === "FLEXIBLE" ? styles.optionCardActive : ""}`}
                onClick={() => setCancellationPolicy("FLEXIBLE")}
              >
                <p className={styles.optionCardTitle}>Flexível</p>
                <p className={styles.optionCardSubtitle}>Reembolso total até 48h antes do check-in.</p>
              </button>
              <button
                type="button"
                className={`${styles.optionCard} ${cancellationPolicy === "MODERATE" ? styles.optionCardActive : ""}`}
                onClick={() => setCancellationPolicy("MODERATE")}
              >
                <p className={styles.optionCardTitle}>Moderada</p>
                <p className={styles.optionCardSubtitle}>Reembolso total até 5 dias antes do check-in.</p>
              </button>
              <button
                type="button"
                className={`${styles.optionCard} ${cancellationPolicy === "STRICT" ? styles.optionCardActive : ""}`}
                onClick={() => setCancellationPolicy("STRICT")}
              >
                <p className={styles.optionCardTitle}>Rigorosa</p>
                <p className={styles.optionCardSubtitle}>50% de reembolso até 7 dias antes do check-in.</p>
              </button>
            </div>
          </div>
        </section>
      )}

      {/* ── ATENDIMENTO/CRM (só organização) ── */}
      {isOrg && (
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionIconWrap}>
              <Users size={22} />
            </div>
            <div>
              <h2 className={styles.sectionTitle}>Atendimento de Leads</h2>
              <p className={styles.sectionSubtitle}>Quem recebe os leads gerados por este imóvel?</p>
            </div>
          </div>

          <div className={styles.optionGrid}>
            <button
              type="button"
              className={`${styles.optionCard} ${!hasSpecificAgent ? styles.optionCardActive : ""}`}
              onClick={() => setHasSpecificAgent(false)}
            >
              <p className={styles.optionCardTitle}>Distribuição da imobiliária</p>
              <p className={styles.optionCardSubtitle}>Segue as regras de distribuição da organização</p>
            </button>
            <button
              type="button"
              className={`${styles.optionCard} ${hasSpecificAgent ? styles.optionCardActive : ""}`}
              onClick={() => setHasSpecificAgent(true)}
            >
              <p className={styles.optionCardTitle}>Responsável por este imóvel</p>
              <p className={styles.optionCardSubtitle}>Escolha uma pessoa específica da equipe</p>
            </button>
          </div>

          {hasSpecificAgent && (
            <div style={{ marginTop: "16px" }}>
              <label className={styles.label} htmlFor="assignedAgentSelect">
                <span>Responsável</span>
              </label>
              <select
                id="assignedAgentSelect"
                value={assignedAgentId}
                onChange={(e) => setAssignedAgentId(e.target.value)}
                className={styles.input}
              >
                <option value="">Selecione…</option>
                {activeMembers.map((m) => (
                  <option key={m.id} value={m.user?.id ?? ""}>
                    {m.user?.name ?? "Membro"} ({m.role})
                  </option>
                ))}
              </select>
            </div>
          )}

          {buildingId && (
            <div style={{ marginTop: "20px", paddingTop: "20px", borderTop: "1px solid var(--border)" }}>
              <label className={styles.toggleItem}>
                <input type="checkbox" checked={assumeBuildingLeads} onChange={(e) => setAssumeBuildingLeads(e.target.checked)} />
                <span>Assumir todos os Leads deste empreendimento</span>
              </label>
            </div>
          )}
        </section>
      )}

      {/* ── COMODIDADES E CAPACIDADE ── */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionIconWrap}>
            <Sparkles size={22} />
          </div>
          <div>
            <h2 className={styles.sectionTitle}>Comodidades e capacidade</h2>
            <p className={styles.sectionSubtitle}>Área, cômodos, vagas e comodidades disponíveis</p>
          </div>
        </div>

        <div className={styles.row}>
          <div>
            <label className={styles.label} htmlFor="privateArea">
              <span>Área privativa (m²)</span>
            </label>
            <input
              id="privateArea"
              type="number"
              min="0"
              step="0.01"
              value={privateArea}
              onChange={(e) => setPrivateArea(e.target.value)}
              className={styles.input}
            />
          </div>
          <div>
            <label className={styles.label} htmlFor="totalArea">
              <span>Área total (m²)</span>
            </label>
            <input
              id="totalArea"
              type="number"
              min="0"
              step="0.01"
              value={totalArea}
              onChange={(e) => setTotalArea(e.target.value)}
              className={styles.input}
            />
          </div>
        </div>

        <div className={styles.airbnbSteppersList} style={{ marginTop: "16px" }}>
          <div className={styles.airbnbRow}>
            <div className={styles.airbnbRowLeft}>
              <div className={styles.airbnbRowIcon}>
                <BedDouble size={22} />
              </div>
              <div>
                <p className={styles.airbnbRowTitle}>Quartos</p>
                <p className={styles.airbnbRowSubtitle}>Quantos quartos possui o imóvel?</p>
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

          <div className={styles.airbnbRow}>
            <div className={styles.airbnbRowLeft}>
              <div className={styles.airbnbRowIcon}>
                <DoorClosed size={22} />
              </div>
              <div>
                <p className={styles.airbnbRowTitle}>Suítes</p>
                <p className={styles.airbnbRowSubtitle}>Quantas suítes possui o imóvel?</p>
              </div>
            </div>
            <div className={styles.airbnbStepper}>
              <button
                type="button"
                className={styles.airbnbCircleBtn}
                onClick={() => setSuites(Math.max(0, suites - 1))}
                disabled={suites <= 0}
                aria-label="Diminuir suítes"
              >
                <Minus size={14} />
              </button>
              <span className={styles.airbnbValue}>{suites}</span>
              <button
                type="button"
                className={styles.airbnbCircleBtn}
                onClick={() => setSuites(suites + 1)}
                aria-label="Aumentar suítes"
              >
                <Plus size={14} />
              </button>
            </div>
          </div>

          <div className={styles.airbnbRow}>
            <div className={styles.airbnbRowLeft}>
              <div className={styles.airbnbRowIcon}>
                <Bath size={22} />
              </div>
              <div>
                <p className={styles.airbnbRowTitle}>Banheiros</p>
                <p className={styles.airbnbRowSubtitle}>Quantidade de banheiros</p>
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
          <AmenitiesSelector value={amenities} onChange={setAmenities} />
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
