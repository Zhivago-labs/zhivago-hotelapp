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
  Camera,
  BedDouble,
  Bath,
  Car,
  DoorClosed,
  Ruler,
  Plus,
  Minus,
  Save,
  CheckCircle2,
  Check,
  ShieldCheck,
  Users,
  ArrowLeft,
  ArrowRight,
  Eye,
  AlertCircle,
} from "lucide-react";
import type { MyOrganization } from "@/lib/organizations-api";
import { createOrganizationBuildingAction, type CreateBuildingState } from "@/lib/actions/organizations";
import { createListingAction } from "@/lib/actions/listings";
import { MultiImageInput } from "./MultiImageInput";
import { AmenitiesSelector } from "./AmenitiesSelector";
import styles from "./ListingForm.module.css";

interface ViaCepResponse {
  erro?: boolean;
  logradouro?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
}

type Modality = "diaria" | "mensal" | "venda";
export type BuildingOption = { id: string; name: string; address: string | null };

const GUARANTEE_OPTIONS = [
  { value: "CAUCAO", label: "Caução" },
  { value: "SEGURO_FIANCA", label: "Seguro-fiança" },
  { value: "FIADOR", label: "Fiador" },
] as const;

const ALL_STEPS = [
  { id: 1, title: "Tipo & Objetivo", subtitle: "Defina a modalidade e o tipo do imóvel" },
  { id: 2, title: "Sobre o Imóvel", subtitle: "Área, cômodos e comodidades" },
  { id: 3, title: "Localização", subtitle: "Endereço completo e empreendimento" },
  { id: 4, title: "Condições", subtitle: "Preço e condições específicas da modalidade" },
  // Só existe pra conta de organização (imobiliária) — seção 72 da spec.
  { id: 5, title: "Atendimento/CRM", subtitle: "Quem recebe os leads deste imóvel", orgOnly: true },
  { id: 6, title: "Fotos & Revisão", subtitle: "Inclua fotos e publique" },
];

/** Mini-formulário "+ Novo empreendimento" (seção 63 da spec) — cria sem sair do wizard. */
function NewBuildingInlineForm({ onCreated, onCancel }: { onCreated: (b: BuildingOption) => void; onCancel: () => void }) {
  const [state, formAction, pending] = useActionState<CreateBuildingState, FormData>(createOrganizationBuildingAction, undefined);

  if (state && "building" in state) {
    onCreated(state.building);
  }

  return (
    <form
      action={formAction}
      className={styles.row}
      style={{ marginTop: "12px", alignItems: "flex-end" }}
      onSubmit={() => {
        /* o resultado é tratado via `state` acima, no próximo render */
      }}
    >
      <div>
        <label className={styles.label} htmlFor="newBuildingName">
          <span>Nome do empreendimento</span>
        </label>
        <input id="newBuildingName" name="name" type="text" placeholder="Ex: Unique Tower" required className={styles.input} />
      </div>
      <div>
        <label className={styles.label} htmlFor="newBuildingAddress">
          <span>Endereço (opcional)</span>
        </label>
        <input id="newBuildingAddress" name="address" type="text" className={styles.input} />
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

export function NewListingForm({ myOrg, buildings }: { myOrg: MyOrganization | null; buildings: BuildingOption[] }) {
  const [state, formAction, pending] = useActionState(createListingAction, undefined);

  // Controle de Etapa (Wizard)
  const [currentStep, setCurrentStep] = useState(1);
  const [stepError, setStepError] = useState<string | null>(null);

  // Estados dos seletores
  const [type, setType] = useState<"casa" | "apartamento">("casa");
  const [modality, setModality] = useState<Modality>("diaria");
  const category = modality === "venda" ? "venda" : "aluguel";
  const billingCycle = modality === "diaria" ? "noite" : modality === "mensal" ? "mês" : "noite";
  const operationType = modality === "venda" ? "SALE" : modality === "mensal" ? "MONTHLY_RENT" : "DAILY_RENT";

  const isOrg = !!myOrg;

  // Só aparece "Regras & Segurança" clássica pra quem é aluguel por diária; a etapa 5 (CRM) só
  // existe pra conta de organização.
  const steps = useMemo(
    () => ALL_STEPS.filter((step) => !(step.orgOnly && !isOrg)),
    [isOrg]
  );

  // Título e Descrição
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  // Características
  const [bedrooms, setBedrooms] = useState(1);
  const [suites, setSuites] = useState(0);
  const [bathrooms, setBathrooms] = useState(1);
  const [parking, setParking] = useState(1);
  const [privateArea, setPrivateArea] = useState("");
  const [totalArea, setTotalArea] = useState("");

  // Seção 61 da spec: nunca começar com comodidades pré-marcadas — o anunciante escolhe tudo.
  const [amenities, setAmenities] = useState<string[]>([]);

  // Estados de Regras e Segurança (só DAILY_RENT)
  const [checkInTime, setCheckInTime] = useState("15:00");
  const [checkOutTime, setCheckOutTime] = useState("11:00");
  const [customMaxGuests, setCustomMaxGuests] = useState(2);
  const [minimumNights, setMinimumNights] = useState("1");
  const [cleaningFee, setCleaningFee] = useState("");
  const [allowPetsDaily, setAllowPetsDaily] = useState(true);
  const [allowSmoking, setAllowSmoking] = useState(false);
  const [allowParties, setAllowParties] = useState(false);
  const [quietHours, setQuietHours] = useState("22:00 às 08:00");
  const [customNotes, setCustomNotes] = useState("");

  const [externalCameras, setExternalCameras] = useState(true);
  const [smokeAlarm, setSmokeAlarm] = useState(true);
  const [fireExtinguisher, setFireExtinguisher] = useState(true);
  const [doorman24h, setDoorman24h] = useState(false);
  const [firstAidKit, setFirstAidKit] = useState(false);

  const [cancellationPolicy, setCancellationPolicy] = useState<"FLEXIBLE" | "MODERATE" | "STRICT">("FLEXIBLE");

  // Condições de VENDA (seção 66)
  const [condoFee, setCondoFee] = useState("");
  const [iptuAnnual, setIptuAnnual] = useState("");
  const [acceptsFinancing, setAcceptsFinancing] = useState(false);
  const [acceptsExchange, setAcceptsExchange] = useState(false);

  // Condições de ALUGUEL MENSAL (seção 67) — condoFee é compartilhado com venda acima
  const [iptuMonthly, setIptuMonthly] = useState("");
  const [availableFrom, setAvailableFrom] = useState("");
  const [minimumLeaseMonths, setMinimumLeaseMonths] = useState("");
  const [guaranteeTypes, setGuaranteeTypes] = useState<string[]>([]);
  const [isFurnished, setIsFurnished] = useState(false);
  const [allowPetsMonthly, setAllowPetsMonthly] = useState(true);

  // Preço e Endereço
  const [price, setPrice] = useState("");
  const [cep, setCep] = useState("");
  const [logradouro, setLogradouro] = useState("");
  const [numero, setNumero] = useState("");
  const [complemento, setComplemento] = useState("");
  const [bairro, setBairro] = useState("");
  const [cidade, setCidade] = useState("");
  const [uf, setUf] = useState("");
  const [loadingCep, setLoadingCep] = useState(false);

  // Empreendimento + Atendimento/CRM (seção 8/63/72 — só organização)
  const [buildingOptions, setBuildingOptions] = useState<BuildingOption[]>(buildings);
  const [buildingId, setBuildingId] = useState("");
  const [showNewBuildingForm, setShowNewBuildingForm] = useState(false);
  const [hasSpecificAgent, setHasSpecificAgent] = useState(false);
  const [assignedAgentId, setAssignedAgentId] = useState("");
  const [assumeBuildingLeads, setAssumeBuildingLeads] = useState(false);
  const activeMembers = useMemo(
    () => (myOrg?.organization.members ?? []).filter((m) => m.status === "ACTIVE"),
    [myOrg]
  );

  const [imageCount, setImageCount] = useState(0);

  const handleCepBlur = async () => {
    const cleanCep = cep.replace(/\D/g, "");
    if (cleanCep.length !== 8) return;
    setLoadingCep(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
      const data: ViaCepResponse = await res.json();
      if (!data.erro) {
        setLogradouro(data.logradouro ?? "");
        setBairro(data.bairro ?? "");
        setCidade(data.localidade ?? "");
        setUf(data.uf ?? "");
      }
    } catch {
      // Falha silenciosa
    } finally {
      setLoadingCep(false);
    }
  };

  const toggleGuaranteeType = (value: string) => {
    setGuaranteeTypes((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
  };

  // Se a etapa selecionada não existir mais na lista filtrada, usa a próxima etapa disponível.
  const rawIndex = steps.findIndex((step) => step.id === currentStep);
  const stepIndex = rawIndex === -1 ? steps.length - 1 : rawIndex;
  const activeStep = steps[stepIndex].id;
  const isLastStep = stepIndex === steps.length - 1;

  // Validação ao tentar avançar de etapa
  const validateAndNext = () => {
    setStepError(null);
    if (activeStep === 2) {
      if (!name.trim()) {
        setStepError("Por favor, informe o título do imóvel para continuar.");
        return;
      }
    } else if (activeStep === 3) {
      if (!cidade.trim() || !uf.trim()) {
        setStepError("Por favor, preencha o CEP e confirme a Cidade e a UF.");
        return;
      }
    } else if (activeStep === 4) {
      if (!price.trim()) {
        setStepError("Informe o valor do anúncio para continuar.");
        return;
      }
    }
    if (!isLastStep) {
      setCurrentStep(steps[stepIndex + 1].id);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handlePrev = () => {
    setStepError(null);
    if (stepIndex > 0) {
      setCurrentStep(steps[stepIndex - 1].id);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const progressPercent = Math.round(((stepIndex + 1) / steps.length) * 100);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const intent = submitter?.value === "draft" ? "draft" : "publish";

    if (imageCount === 0) {
      event.preventDefault();
      setStepError("Adicione ao menos uma foto do imóvel para salvar o anúncio.");
      return;
    }
    if (intent === "publish" && !price.trim()) {
      event.preventDefault();
      setStepError("Informe o valor do anúncio para publicar.");
      return;
    }
  };

  return (
    <form action={formAction} onSubmit={handleSubmit} className={styles.form}>
      {/* Campos ocultos mantidos para envio total ao Server Action */}
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
      <input type="hidden" name="buildingId" value={buildingId} />
      <input type="hidden" name="assumeBuildingLeads" value={String(assumeBuildingLeads)} />
      <input type="hidden" name="assignedAgentId" value={hasSpecificAgent ? assignedAgentId : ""} />
      {/* Título, descrição, endereço e comodidades precisam sobreviver à troca de etapa —
          seus campos visíveis só existem no DOM enquanto a etapa correspondente está ativa. */}
      <input type="hidden" name="name" value={name} />
      <input type="hidden" name="price" value={price} />
      <input type="hidden" name="description" value={description} />
      <input type="hidden" name="cep" value={cep} />
      <input type="hidden" name="logradouro" value={logradouro} />
      <input type="hidden" name="numero" value={numero} />
      <input type="hidden" name="complemento" value={complemento} />
      <input type="hidden" name="bairro" value={bairro} />
      <input type="hidden" name="cidade" value={cidade} />
      <input type="hidden" name="uf" value={uf} />
      <input type="hidden" name="amenities" value={JSON.stringify(amenities)} />

      {/* ── CABEÇALHO DO WIZARD COM BARRA DE PROGRESSO & STEPPER ── */}
      <div className={styles.wizardHeaderCard}>
        <div className={styles.wizardTopRow}>
          <span className={styles.stepBadge}>
            Etapa {stepIndex + 1} de {steps.length}
          </span>
          <span className={styles.progressPercentText}>{progressPercent}% concluído</span>
        </div>

        <div className={styles.progressBarBg}>
          <div className={styles.progressBarFill} style={{ width: `${progressPercent}%` }} />
        </div>

        <div className={styles.stepperTabs}>
          {steps.map((step) => {
            const isDone = activeStep > step.id;
            const isActive = activeStep === step.id;
            return (
              <button
                key={step.id}
                type="button"
                className={`${styles.stepperTab} ${isActive ? styles.stepperTabActive : ""} ${
                  isDone ? styles.stepperTabDone : ""
                }`}
                onClick={() => {
                  setStepError(null);
                  setCurrentStep(step.id);
                }}
              >
                <span className={styles.stepperDot}>{isDone ? <Check size={12} /> : step.id}</span>
                <span className={styles.stepperTabTitle}>{step.title}</span>
              </button>
            );
          })}
        </div>
      </div>

      {stepError && (
        <div className={styles.stepErrorAlert}>
          <AlertCircle size={18} />
          <span>{stepError}</span>
        </div>
      )}

      {/* ── ETAPA 1: TIPO & OBJETIVO ── */}
      {activeStep === 1 && (
        <div className={styles.stepContent}>
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionIconWrap}>
                <Tag size={22} />
              </div>
              <div>
                <h2 className={styles.sectionTitle}>O que você quer fazer?</h2>
                <p className={styles.sectionSubtitle}>A modalidade define o restante do formulário</p>
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

          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionIconWrap}>
                <Home size={22} />
              </div>
              <div>
                <h2 className={styles.sectionTitle}>Qual o tipo do seu imóvel?</h2>
                <p className={styles.sectionSubtitle}>Selecione a categoria que melhor descreve seu espaço</p>
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
                <FileText size={22} />
              </div>
              <div>
                <h2 className={styles.sectionTitle}>Título e descrição do espaço</h2>
                <p className={styles.sectionSubtitle}>Destaque os principais diferenciais que tornam seu imóvel único</p>
              </div>
            </div>

            <label className={styles.label} htmlFor="name">
              <span>Título do anúncio *</span>
            </label>
            <input
              id="name"
              type="text"
              placeholder="Ex: Loft Aconchegante com Varanda Gourmet e Vista para o Mar"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={styles.input}
            />

            <label className={styles.label} htmlFor="description">
              <span>Descrição detalhada</span>
            </label>
            <textarea
              id="description"
              rows={6}
              placeholder="Descreva a atmosfera do local, comodidades próximas, facilidade de acesso e destaques..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={styles.textarea}
            />
          </section>
        </div>
      )}

      {/* ── ETAPA 2: SOBRE O IMÓVEL ── */}
      {activeStep === 2 && (
        <div className={styles.stepContent}>
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionIconWrap}>
                <Sparkles size={22} />
              </div>
              <div>
                <h2 className={styles.sectionTitle}>Capacidade & Estrutura</h2>
                <p className={styles.sectionSubtitle}>Ajuste cômodos, área e comodidades disponíveis</p>
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
                  placeholder="Ex: 68"
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
                  placeholder="Ex: 75"
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
                    <p className={styles.airbnbRowSubtitle}>Quantidade de vagas de garagem</p>
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
        </div>
      )}

      {/* ── ETAPA 3: LOCALIZAÇÃO ── */}
      {activeStep === 3 && (
        <div className={styles.stepContent}>
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionIconWrap}>
                <MapPin size={22} />
              </div>
              <div>
                <h2 className={styles.sectionTitle}>Onde fica o seu imóvel?</h2>
                <p className={styles.sectionSubtitle}>Insira o CEP para preenchimento automático da localização</p>
              </div>
            </div>

            <label className={styles.label} htmlFor="cep">
              <span>CEP * {loadingCep ? "(Buscando endereço…)" : ""}</span>
            </label>
            <input
              id="cep"
              type="text"
              placeholder="00000-000"
              maxLength={9}
              required
              value={cep}
              onChange={(e) => setCep(e.target.value)}
              onBlur={handleCepBlur}
              className={styles.input}
            />

            <div className={styles.row} style={{ marginTop: "16px" }}>
              <div style={{ gridColumn: "span 2" }}>
                <label className={styles.label} htmlFor="logradouro">
                  <span>Logradouro / Rua</span>
                </label>
                <input
                  id="logradouro"
                  type="text"
                  placeholder="Rua, Avenida, Alameda..."
                  value={logradouro}
                  onChange={(e) => setLogradouro(e.target.value)}
                  className={styles.input}
                />
              </div>
              <div>
                <label className={styles.label} htmlFor="numero">
                  <span>Número</span>
                </label>
                <input
                  id="numero"
                  type="text"
                  placeholder="123 ou S/N"
                  value={numero}
                  onChange={(e) => setNumero(e.target.value)}
                  className={styles.input}
                />
              </div>
            </div>

            <div className={styles.row} style={{ marginTop: "16px" }}>
              <div>
                <label className={styles.label} htmlFor="complemento">
                  <span>Complemento</span>
                </label>
                <input
                  id="complemento"
                  type="text"
                  placeholder="Apto, bloco, casa..."
                  value={complemento}
                  onChange={(e) => setComplemento(e.target.value)}
                  className={styles.input}
                />
              </div>
              <div>
                <label className={styles.label} htmlFor="bairro">
                  <span>Bairro</span>
                </label>
                <input
                  id="bairro"
                  type="text"
                  placeholder="Nome do bairro"
                  value={bairro}
                  onChange={(e) => setBairro(e.target.value)}
                  className={styles.input}
                />
              </div>
            </div>

            <div className={styles.row} style={{ marginTop: "16px" }}>
              <div>
                <label className={styles.label} htmlFor="cidade">
                  <span>Cidade *</span>
                </label>
                <input
                  id="cidade"
                  type="text"
                  placeholder="Nome da cidade"
                  required
                  value={cidade}
                  onChange={(e) => setCidade(e.target.value)}
                  className={styles.input}
                />
              </div>
              <div>
                <label className={styles.label} htmlFor="uf">
                  <span>UF (Estado) *</span>
                </label>
                <input
                  id="uf"
                  type="text"
                  maxLength={2}
                  placeholder="SP"
                  required
                  value={uf}
                  onChange={(e) => setUf(e.target.value.toUpperCase())}
                  className={styles.input}
                />
              </div>
            </div>
          </section>

          {isOrg && (
            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <div className={styles.sectionIconWrap}>
                  <Building2 size={22} />
                </div>
                <div>
                  <h2 className={styles.sectionTitle}>Empreendimento</h2>
                  <p className={styles.sectionSubtitle}>Vincule este imóvel a um empreendimento já cadastrado, se houver</p>
                </div>
              </div>

              <label className={styles.label} htmlFor="buildingSelect">
                <span>Empreendimento (opcional)</span>
              </label>
              <select
                id="buildingSelect"
                value={buildingId}
                onChange={(e) => setBuildingId(e.target.value)}
                className={styles.input}
              >
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
            </section>
          )}
        </div>
      )}

      {/* ── ETAPA 4: CONDIÇÕES (por modalidade) ── */}
      {activeStep === 4 && (
        <div className={styles.stepContent}>
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionIconWrap}>
                <Tag size={22} />
              </div>
              <div>
                <h2 className={styles.sectionTitle}>
                  {modality === "diaria" ? "Preço por noite" : modality === "mensal" ? "Preço mensal" : "Preço de venda"}
                </h2>
                <p className={styles.sectionSubtitle}>
                  {modality === "diaria"
                    ? "Valor cobrado por noite de hospedagem"
                    : modality === "mensal"
                    ? "Valor do aluguel cobrado mensalmente"
                    : "Valor total de venda do imóvel"}
                </p>
              </div>
            </div>

            <div className={styles.airbnbPriceHero}>
              <span className={styles.airbnbPriceSymbol}>R$</span>
              <input
                id="price"
                type="number"
                min="0"
                step="0.01"
                placeholder="0"
                required
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className={styles.airbnbPriceInput}
              />
            </div>
          </section>

          {/* ── VENDA (seção 66) ── */}
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

          {/* ── ALUGUEL MENSAL (seção 67) ── */}
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

          {/* ── DIÁRIA (seção 68) — mantém regras/segurança/cancelamento já existentes ── */}
          {modality === "diaria" && (
            <>
              <section className={styles.section}>
                <div className={styles.sectionHeader}>
                  <div className={styles.sectionIconWrap}>
                    <ShieldCheck size={22} />
                  </div>
                  <div>
                    <h2 className={styles.sectionTitle}>Regras da acomodação & Segurança</h2>
                    <p className={styles.sectionSubtitle}>Horários, restrições e políticas de cancelamento para seus hóspedes</p>
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
                      placeholder="Ex: 22:00 às 08:00"
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
                      placeholder="Ex: Retirar os sapatos na entrada"
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
            </>
          )}
        </div>
      )}

      {/* ── ETAPA 5: ATENDIMENTO/CRM (só organização) ── */}
      {activeStep === 5 && isOrg && (
        <div className={styles.stepContent}>
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
                  <input
                    type="checkbox"
                    checked={assumeBuildingLeads}
                    onChange={(e) => setAssumeBuildingLeads(e.target.checked)}
                  />
                  <span>Assumir todos os Leads deste empreendimento</span>
                </label>
              </div>
            )}
          </section>
        </div>
      )}

      {/* ── ETAPA 6: FOTOS & REVISÃO ── */}
      {activeStep === 6 && (
        <div className={styles.stepContent}>
          <div className={styles.finalStepGrid}>
            <div className={styles.finalStepLeft}>
              <section className={styles.section}>
                <div className={styles.sectionHeader}>
                  <div className={styles.sectionIconWrap}>
                    <Camera size={22} />
                  </div>
                  <div>
                    <h2 className={styles.sectionTitle}>Fotos do espaço</h2>
                    <p className={styles.sectionSubtitle}>Adicione fotos de alta qualidade para atrair mais interessados</p>
                  </div>
                </div>

                <MultiImageInput name="images" onFilesChange={setImageCount} />
              </section>
            </div>

            <aside className={styles.previewSidebar}>
              <div className={styles.previewCard}>
                <div className={styles.previewHeader}>
                  <Eye size={16} />
                  <span>Prévia do Anúncio</span>
                </div>

                <div className={styles.previewImagePlaceholder}>
                  <Camera size={32} />
                  <span>Suas fotos aparecerão aqui</span>
                </div>

                <div className={styles.previewBody}>
                  <h4 className={styles.previewTitle}>{name.trim() ? name : "Título do seu anúncio"}</h4>
                  <p className={styles.previewLocation}>
                    <MapPin size={14} />
                    <span>{cidade && uf ? `${cidade}, ${uf}` : "Cidade, UF"}</span>
                  </p>

                  <div className={styles.previewSpecs}>
                    <span>{type === "casa" ? "Casa" : "Apartamento"}</span>
                    <span>•</span>
                    <span>{bedrooms} {bedrooms === 1 ? "quarto" : "quartos"}</span>
                    <span>•</span>
                    <span>{bathrooms} {bathrooms === 1 ? "banheiro" : "banheiros"}</span>
                  </div>

                  <div className={styles.previewPriceRow}>
                    <span className={styles.previewPriceLabel}>Valor:</span>
                    <span className={styles.previewPriceVal}>
                      {price ? Number(price).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "R$ 0"}
                      {modality === "diaria" ? " / noite" : modality === "mensal" ? " / mês" : ""}
                    </span>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </div>
      )}

      {state?.error && (
        <div className={styles.stepErrorAlert}>
          <AlertCircle size={18} />
          <span>{state.error}</span>
        </div>
      )}

      {/* ── BARRA FIXA DE NAVEGAÇÃO INFERIOR ── */}
      <div className={styles.wizardNavFooter}>
        <div className={styles.wizardNavContainer}>
          {stepIndex > 0 ? (
            <button type="button" onClick={handlePrev} className={styles.secondaryButton}>
              <ArrowLeft size={16} />
              <span>Voltar</span>
            </button>
          ) : (
            <div />
          )}

          <div className={styles.wizardNavRight}>
            {!isLastStep ? (
              <button type="button" onClick={validateAndNext} className={styles.button}>
                <span>Continuar</span>
                <ArrowRight size={16} />
              </button>
            ) : (
              <>
                <button type="submit" name="intent" value="draft" className={styles.secondaryButton} disabled={pending}>
                  <Save size={16} />
                  <span>{pending ? "Salvando…" : "Salvar rascunho"}</span>
                </button>
                <button type="submit" name="intent" value="publish" className={styles.button} disabled={pending}>
                  <CheckCircle2 size={16} />
                  <span>{pending ? "Publicando…" : "Publicar anúncio"}</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </form>
  );
}
