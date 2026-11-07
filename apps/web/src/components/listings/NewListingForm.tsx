"use client";

import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from "react";
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
  MessageCircle,
} from "lucide-react";
import { useChatSocket } from "@/components/chat/ChatSocketProvider";
import { listingDraft } from "@/lib/listing-draft";
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
  const [state, setState] = useState<CreateBuildingState>();
  const [pending, startTransition] = useTransition();
  const inlineRef = useRef<HTMLDivElement>(null);
  const createBuilding = () => {
    const inputs = inlineRef.current?.querySelectorAll<HTMLInputElement>("input");
    if (!inputs) return;
    const data = new FormData();
    inputs.forEach(input => data.set(input.name, input.value));
    startTransition(async () => {
      const result = await createOrganizationBuildingAction(undefined, data);
      if (result && "building" in result) onCreated(result.building);
      else setState(result);
    });
  };

  return (
    <div ref={inlineRef} className={styles.row} style={{ marginTop: "12px", alignItems: "flex-end" }}>
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
        <button type="button" onClick={createBuilding} className={styles.secondaryButton} disabled={pending}>
          {pending ? "Criando…" : "Criar"}
        </button>
        <button type="button" className={styles.secondaryButton} onClick={onCancel}>
          Cancelar
        </button>
      </div>
      {state && "error" in state && <p className={styles.error}>{state.error}</p>}
    </div>
  );
}

export function NewListingForm({ myOrg, buildings, userId }: { myOrg: MyOrganization | null; buildings: BuildingOption[]; userId: string }) {
  const [state, formAction, pending] = useActionState(createListingAction, undefined);
  const { openSidebar, unreadCount } = useChatSocket();

  const footerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!footerRef.current) return;
    const observer = new ResizeObserver(([entry]) => document.documentElement.style.setProperty("--listing-actions-height", (String(entry.borderBoxSize[0]?.blockSize ?? entry.contentRect.height) + "px")));
    observer.observe(footerRef.current);
    return () => { observer.disconnect(); document.documentElement.style.removeProperty("--listing-actions-height"); };
  }, []);
  const formRef = useRef<HTMLFormElement>(null);
  const [draftMessage, setDraftMessage] = useState("");
  const [draftAvailable, setDraftAvailable] = useState(false);
  const [draftFiles, setDraftFiles] = useState<File[]>([]);
  const [draftRevision, setDraftRevision] = useState(0);
  const filesRef = useRef<File[]>([]);
  const [savingDraft, setSavingDraft] = useState(false);
  const [structureConfirmed, setStructureConfirmed] = useState(false);

  // Controle de Etapa (Wizard)
  const [currentStep, updateCurrentStep] = useState(1);
  const [visitedSteps, setVisitedSteps] = useState<number[]>([1]);
  const setCurrentStep = (next: number) => {
    updateCurrentStep(next);
    setVisitedSteps(previous => previous.includes(next) ? previous : [...previous, next]);
  };
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
  const [bedrooms, setBedrooms] = useState(0);
  const [suites, setSuites] = useState(0);
  const [bathrooms, setBathrooms] = useState(0);
  const [parking, setParking] = useState(0);
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
  const [allowPetsDaily, setAllowPetsDaily] = useState(false);
  const [allowSmoking, setAllowSmoking] = useState(false);
  const [allowParties, setAllowParties] = useState(false);
  const [quietHours, setQuietHours] = useState("22:00 às 08:00");
  const [customNotes, setCustomNotes] = useState("");

  const [externalCameras, setExternalCameras] = useState<boolean | null>(null);
  const [smokeAlarm, setSmokeAlarm] = useState<boolean | null>(null);
  const [fireExtinguisher, setFireExtinguisher] = useState<boolean | null>(null);
  const [doorman24h, setDoorman24h] = useState<boolean | null>(null);
  const [firstAidKit, setFirstAidKit] = useState<boolean | null>(null);

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
  const [allowPetsMonthly, setAllowPetsMonthly] = useState(false);

  // Preço e Endereço
  const [price, setPrice] = useState("");
  // Negociação de valor no chat — piso opcional e sigiloso
  const [acceptsNegotiation, setAcceptsNegotiation] = useState(false);
  const [minNegotiablePrice, setMinNegotiablePrice] = useState("");
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

  const visibleAmenities = amenities.filter(id => !["pet_friendly", "estacionamento", "cameras"].includes(id) && (modality === "diaria" || isFurnished || !["wifi", "tv", "cafeteira", "maquina_lavar", "cozinha"].includes(id)));
  const [imageCount, setImageCount] = useState(0);

  const snapshot = () => ({ structureConfirmed, currentStep, type, modality, name, description, bedrooms, suites, bathrooms, parking, privateArea, totalArea, amenities, checkInTime, checkOutTime, customMaxGuests, minimumNights, cleaningFee, allowPetsDaily, allowSmoking, allowParties, quietHours, customNotes, externalCameras, smokeAlarm, fireExtinguisher, doorman24h, firstAidKit, cancellationPolicy, condoFee, iptuAnnual, acceptsFinancing, acceptsExchange, iptuMonthly, availableFrom, minimumLeaseMonths, guaranteeTypes, isFurnished, allowPetsMonthly, price, acceptsNegotiation, minNegotiablePrice, cep, logradouro, numero, complemento, bairro, cidade, uf, buildingId, hasSpecificAgent, assignedAgentId, assumeBuildingLeads, files: filesRef.current });
  type DraftSnapshot = ReturnType<typeof snapshot>;
  useEffect(() => { listingDraft<DraftSnapshot>(userId).then(d => setDraftAvailable(!!d)).catch(() => setDraftMessage("Não foi possível consultar o rascunho neste navegador.")); }, [userId]);
  const saveDraft = async () => {
    setSavingDraft(true);
    try { await listingDraft(userId, snapshot()); setDraftAvailable(true); setDraftMessage("Rascunho salvo neste navegador, incluindo as fotos. Retome por Anunciar imóvel nesta conta."); }
    catch { setDraftMessage("Não foi possível salvar o rascunho. Verifique o espaço e as permissões do navegador."); }
    finally { setSavingDraft(false); }
  };
  const restoreDraft = async () => {
    try {
      const draft = await listingDraft<DraftSnapshot>(userId);
      if (!draft) return;
      setStructureConfirmed(draft.structureConfirmed);
      setCurrentStep(draft.currentStep);
      setType(draft.type);
      setModality(draft.modality);
      setName(draft.name);
      setDescription(draft.description);
      setBedrooms(draft.bedrooms);
      setSuites(draft.suites);
      setBathrooms(draft.bathrooms);
      setParking(draft.parking);
      setPrivateArea(draft.privateArea);
      setTotalArea(draft.totalArea);
      setAmenities(draft.amenities);
      setCheckInTime(draft.checkInTime);
      setCheckOutTime(draft.checkOutTime);
      setCustomMaxGuests(draft.customMaxGuests);
      setMinimumNights(draft.minimumNights);
      setCleaningFee(draft.cleaningFee);
      setAllowPetsDaily(draft.allowPetsDaily);
      setAllowSmoking(draft.allowSmoking);
      setAllowParties(draft.allowParties);
      setQuietHours(draft.quietHours);
      setCustomNotes(draft.customNotes);
      setExternalCameras(draft.externalCameras);
      setSmokeAlarm(draft.smokeAlarm);
      setFireExtinguisher(draft.fireExtinguisher);
      setDoorman24h(draft.doorman24h);
      setFirstAidKit(draft.firstAidKit);
      setCancellationPolicy(draft.cancellationPolicy);
      setCondoFee(draft.condoFee);
      setIptuAnnual(draft.iptuAnnual);
      setAcceptsFinancing(draft.acceptsFinancing);
      setAcceptsExchange(draft.acceptsExchange);
      setIptuMonthly(draft.iptuMonthly);
      setAvailableFrom(draft.availableFrom);
      setMinimumLeaseMonths(draft.minimumLeaseMonths);
      setGuaranteeTypes(draft.guaranteeTypes);
      setIsFurnished(draft.isFurnished);
      setAllowPetsMonthly(draft.allowPetsMonthly);
      setPrice(draft.price);
      setAcceptsNegotiation(draft.acceptsNegotiation);
      setMinNegotiablePrice(draft.minNegotiablePrice);
      setCep(draft.cep);
      setLogradouro(draft.logradouro);
      setNumero(draft.numero);
      setComplemento(draft.complemento);
      setBairro(draft.bairro);
      setCidade(draft.cidade);
      setUf(draft.uf);
      setBuildingId(draft.buildingId);
      setHasSpecificAgent(draft.hasSpecificAgent);
      setAssignedAgentId(draft.assignedAgentId);
      setAssumeBuildingLeads(draft.assumeBuildingLeads);
      filesRef.current = draft.files; setDraftFiles(draft.files); setImageCount(draft.files.length);
      setDraftRevision(previous => previous + 1);
      setDraftMessage("Rascunho recuperado. Revise os dados antes de publicar.");
    } catch { setDraftMessage("Não foi possível recuperar o rascunho."); }
  };

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

  const issuesForStep = (step: number): { field: string; message: string }[] => {
    if (step === 1) return !name.trim() ? [{ field: "name", message: "Informe o título do imóvel." }] : [];
    if (step === 2) return [
      ...(!structureConfirmed ? [{ field: "structureConfirmed", message: "Confirme as quantidades de cômodos e vagas, inclusive quando forem zero." }] : []),
      ...([privateArea, totalArea].some(value => value !== "" && (!Number.isFinite(Number(value)) || Number(value) < 0)) ? [{ field: "privateArea", message: "Informe áreas com valores não negativos." }] : []),
    ];
    if (step === 3) return [
      ...(cep.replace(/\D/g, "").length !== 8 ? [{ field: "cep", message: "Informe um CEP com 8 dígitos." }] : []),
      ...(!cidade.trim() ? [{ field: "cidade", message: "Informe a cidade." }] : []),
      ...(!/^[A-Za-z]{2}$/.test(uf) ? [{ field: "uf", message: "Informe a UF com duas letras." }] : []),
    ];
    if (step === 4) return [
      ...(!(Number(price) > 0 && Number.isFinite(Number(price))) ? [{ field: "price", message: "Informe um preço maior que zero." }] : []),
      ...(modality === "diaria" && [externalCameras, smokeAlarm, fireExtinguisher, doorman24h, firstAidKit].some(v => v === null) ? [{ field: "safety", message: "Informe se o imóvel possui cada item de segurança." }] : []),
      ...(modality === "diaria" && (!Number.isInteger(customMaxGuests) || customMaxGuests < 1) ? [{ field: "customMaxGuests", message: "Informe a capacidade de hóspedes." }] : []),
      ...(modality === "diaria" && (!Number.isInteger(Number(minimumNights)) || Number(minimumNights) < 1) ? [{ field: "minimumNights", message: "Informe a estadia mínima em noites." }] : []),
      ...((modality === "diaria" ? [cleaningFee] : modality === "venda" ? [condoFee, iptuAnnual] : [condoFee, iptuMonthly]).some(value => value !== "" && (!Number.isFinite(Number(value)) || Number(value) < 0)) ? [{ field: "price", message: "Encargos devem ter valores não negativos." }] : []),
    ];
    if (step === 6) return imageCount === 0 ? [{ field: "photos", message: "Adicione ao menos uma foto." }] : [];
    return [];
  };
  const pendingIssues = steps.flatMap(step => issuesForStep(step.id).map(issue => ({ ...issue, step: step.id })));
  const showErrors = (step: number) => {
    const issues = issuesForStep(step);
    if (!issues.length) return false;
    setStepError(issues[0].message);
    requestAnimationFrame(() => document.getElementById(issues[0].field)?.focus());
    return true;
  };
  const validateAndNext = () => {
    setStepError(null);
    if (showErrors(activeStep)) return;
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

    if (intent === "draft") {
      event.preventDefault();
      void saveDraft();
      return;
    }
    if (pendingIssues.length) {
      event.preventDefault();
      setCurrentStep(pendingIssues[0].step);
      setStepError(pendingIssues[0].message);
      requestAnimationFrame(() => document.getElementById(pendingIssues[0].field)?.focus());
    }
  };

  return (
    <form ref={formRef} noValidate action={formAction} onSubmit={handleSubmit} className={styles.form} aria-busy={pending || savingDraft}>
      {pending && <p role="status">Enviando fotos e dados do imóvel. Aguarde a confirmação.</p>}
      {draftAvailable && <button type="button" className={styles.secondaryButton} onClick={restoreDraft}>Recuperar rascunho deste navegador</button>}
      <p>O rascunho fica salvo neste navegador e nesta conta. Salve antes de sair.</p>
      {/* Campos ocultos mantidos para envio total ao Server Action */}
      <input type="hidden" name="structureConfirmed" value={String(structureConfirmed)} />
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
      <input type="hidden" name="acceptsNegotiation" value={String(acceptsNegotiation)} />
      <input type="hidden" name="minNegotiablePrice" value={minNegotiablePrice} />
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
          <span className={styles.progressPercentText}>Posição no formulário</span>
        </div>

        <div className={styles.progressBarBg}>
          <div className={styles.progressBarFill} style={{ width: `${progressPercent}%` }} />
        </div>

        <div className={styles.stepperTabs}>
          {steps.map((step, index) => {
            const isDone = issuesForStep(step.id).length === 0;
            const isActive = activeStep === step.id;
            return (
              <button
                key={step.id}
                aria-current={isActive ? "step" : undefined}
                aria-label={`${index + 1}. ${step.title}: ${isDone ? "requisitos atendidos" : visitedSteps.includes(step.id) ? "visitada, incompleta" : "não visitada, incompleta"}`}
                type="button"
                className={`${styles.stepperTab} ${isActive ? styles.stepperTabActive : ""} ${
                  isDone ? styles.stepperTabDone : ""
                }`}
                onClick={() => {
                  setStepError(null);
                  setCurrentStep(step.id);
                }}
              >
                <span className={styles.stepperDot}>{isDone ? <Check size={12} /> : index + 1}</span>
                <span className={styles.stepperTabTitle}>{step.title}</span>
              </button>
            );
          })}
        </div>
      </div>

      {stepError && (
        <div className={styles.stepErrorAlert} role="alert">
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
                <p className={styles.sectionSubtitle}>A modalidade define o restante do formulário. Ao mudar, as escolhas ficam guardadas durante o preenchimento; somente os campos aplicáveis à modalidade atual serão enviados.</p>
              </div>
            </div>

            <div className={styles.optionGrid}>
              <button
                type="button"
                className={`${styles.optionCard} ${modality === "diaria" ? styles.optionCardActive : ""}`}
                aria-pressed={modality === "diaria"}
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
                aria-pressed={modality === "mensal"}
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
                aria-pressed={modality === "venda"}
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
                <p className={styles.sectionSubtitle}>Selecione a categoria que melhor descreve seu imóvel</p>
              </div>
            </div>

            <div className={styles.optionGrid}>
              <button
                type="button"
                className={`${styles.optionCard} ${type === "casa" ? styles.optionCardActive : ""}`}
                aria-pressed={type === "casa"}
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
                aria-pressed={type === "apartamento"}
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
                <h2 className={styles.sectionTitle}>Título e descrição do imóvel</h2>
                <p className={styles.sectionSubtitle}>Destaque os principais diferenciais que tornam seu imóvel único</p>
              </div>
            </div>

            <label className={styles.label} htmlFor="name">
              <span>Título do anúncio *</span>
            </label>
            <input
              id="name"
              aria-invalid={!!stepError && issuesForStep(activeStep).some(i => i.field === "name")}
              aria-describedby={stepError ? "name-error" : undefined}
              type="text"
              placeholder="Ex: Loft Aconchegante com Varanda Gourmet e Vista para o Mar"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={styles.input}
            />
            {stepError && issuesForStep(activeStep).filter(i => i.field === "name").map(i => <p id="name-error" key={i.field} className={styles.error}>{i.message}</p>)}

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
                    onClick={() => { setStructureConfirmed(false); setBedrooms(Math.max(0, bedrooms - 1)); }}
                    disabled={bedrooms <= 0}
                    aria-label="Diminuir quartos"
                  >
                    <Minus size={14} />
                  </button>
                  <span className={styles.airbnbValue}>{bedrooms}</span>
                  <button
                    type="button"
                    className={styles.airbnbCircleBtn}
                    onClick={() => { setStructureConfirmed(false); setBedrooms(bedrooms + 1); }}
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
                    onClick={() => { setStructureConfirmed(false); setSuites(Math.max(0, suites - 1)); }}
                    disabled={suites <= 0}
                    aria-label="Diminuir suítes"
                  >
                    <Minus size={14} />
                  </button>
                  <span className={styles.airbnbValue}>{suites}</span>
                  <button
                    type="button"
                    className={styles.airbnbCircleBtn}
                    onClick={() => { setStructureConfirmed(false); setSuites(suites + 1); }}
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
                    onClick={() => { setStructureConfirmed(false); setBathrooms(Math.max(0, bathrooms - 1)); }}
                    disabled={bathrooms <= 0}
                    aria-label="Diminuir banheiros"
                  >
                    <Minus size={14} />
                  </button>
                  <span className={styles.airbnbValue}>{bathrooms}</span>
                  <button
                    type="button"
                    className={styles.airbnbCircleBtn}
                    onClick={() => { setStructureConfirmed(false); setBathrooms(bathrooms + 1); }}
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
                    onClick={() => { setStructureConfirmed(false); setParking(Math.max(0, parking - 1)); }}
                    disabled={parking <= 0}
                    aria-label="Diminuir vagas de garagem"
                  >
                    <Minus size={14} />
                  </button>
                  <span className={styles.airbnbValue}>{parking}</span>
                  <button
                    type="button"
                    className={styles.airbnbCircleBtn}
                    onClick={() => { setStructureConfirmed(false); setParking(parking + 1); }}
                    aria-label="Aumentar vagas de garagem"
                  >
                    <Plus size={14} />
                  </button>
                </div>
              </div>
            </div>

            <div style={{ marginTop: "24px", paddingTop: "24px", borderTop: "1px solid var(--border)" }}>
              <label className={styles.toggleItem}><input id="structureConfirmed" type="checkbox" checked={structureConfirmed} aria-invalid={!!stepError && !structureConfirmed} aria-describedby={stepError && !structureConfirmed ? "structure-error" : undefined} onChange={e => setStructureConfirmed(e.target.checked)} />Confirmo as quantidades de quartos, suítes, banheiros e vagas informadas acima.</label>
              {stepError && !structureConfirmed && <p id="structure-error" className={styles.error}>Confirme as quantidades de cômodos e vagas, inclusive quando forem zero.</p>}
              <label className={styles.toggleItem}><input type="checkbox" checked={isFurnished} onChange={e => setIsFurnished(e.target.checked)} />Mobiliado — selecione para informar equipamentos incluídos</label>
              <AmenitiesSelector value={amenities} onChange={setAmenities} modality={modality} furnished={isFurnished} />
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
              aria-invalid={!!stepError && issuesForStep(activeStep).some(i => i.field === "cep")}
              aria-describedby={stepError ? "cep-error" : undefined}
              type="text"
              placeholder="00000-000"
              maxLength={9}
              required
              value={cep}
              onChange={(e) => setCep(e.target.value)}
              onBlur={handleCepBlur}
              className={styles.input}
            />
            {stepError && issuesForStep(activeStep).filter(i => i.field === "cep").map(i => <p id="cep-error" key={i.field} className={styles.error}>{i.message}</p>)}

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
              aria-invalid={!!stepError && issuesForStep(activeStep).some(i => i.field === "cidade")}
              aria-describedby={stepError ? "cidade-error" : undefined}
                  type="text"
                  placeholder="Nome da cidade"
                  required
                  value={cidade}
                  onChange={(e) => setCidade(e.target.value)}
                  className={styles.input}
                />
            {stepError && issuesForStep(activeStep).filter(i => i.field === "cidade").map(i => <p id="cidade-error" key={i.field} className={styles.error}>{i.message}</p>)}
              </div>
              <div>
                <label className={styles.label} htmlFor="uf">
                  <span>UF (Estado) *</span>
                </label>
                <input
                  id="uf"
              aria-invalid={!!stepError && issuesForStep(activeStep).some(i => i.field === "uf")}
              aria-describedby={stepError ? "uf-error" : undefined}
                  type="text"
                  maxLength={2}
                  placeholder="SP"
                  required
                  value={uf}
                  onChange={(e) => setUf(e.target.value.toUpperCase())}
                  className={styles.input}
                />
            {stepError && issuesForStep(activeStep).filter(i => i.field === "uf").map(i => <p id="uf-error" key={i.field} className={styles.error}>{i.message}</p>)}
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
                aria-label={modality === "diaria" ? "Diária em reais" : modality === "mensal" ? "Aluguel mensal em reais" : "Preço de venda em reais"}
              aria-invalid={!!stepError && issuesForStep(activeStep).some(i => i.field === "price")}
              aria-describedby={stepError ? "price-error" : undefined}
                type="number"
                min="0"
                step="0.01"
                placeholder="0"
                required
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className={styles.airbnbPriceInput}
              />
            {stepError && issuesForStep(activeStep).filter(i => i.field === "price").map(i => <p id="price-error" key={i.field} className={styles.error}>{i.message}</p>)}
            </div>

            <div className={styles.toggleGrid} style={{ marginTop: "16px" }}>
              <label className={styles.toggleItem}>
                <input
                  type="checkbox"
                  checked={acceptsNegotiation}
                  onChange={(e) => setAcceptsNegotiation(e.target.checked)}
                />
                <span>Aceita negociação de valor pelo chat</span>
              </label>
            </div>
            {acceptsNegotiation && (
              <div style={{ marginTop: "12px" }}>
                <label className={styles.label} htmlFor="minNegotiablePrice">
                  <span>
                    Valor mínimo aceito (R${modality === "diaria" ? " por noite" : modality === "mensal" ? "/mês" : ""}) — opcional
                  </span>
                </label>
                <input
                  id="minNegotiablePrice"
                  type="number"
                  min="0"
                  step="0.01"
                  value={minNegotiablePrice}
                  onChange={(e) => setMinNegotiablePrice(e.target.value)}
                  className={styles.input}
                />
                <p className={styles.sectionSubtitle}>
                  Nunca aparece para o cliente. Propostas abaixo dele são recusadas automaticamente.
                </p>
              </div>
            )}
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
                  {stepError && issuesForStep(4).some(issue => issue.field === "safety") && <p id="safety-error" className={styles.error}>Informe se o imóvel possui cada item de segurança.</p>}
                  <div id="safety" role="group" aria-label="Itens de segurança" aria-describedby={stepError ? "safety-error" : undefined} tabIndex={-1} className={styles.toggleGrid}>
                    <label className={styles.toggleItem}>
                      <select aria-label="Câmeras externas" value={externalCameras === null ? "" : String(externalCameras)} onChange={(e) => setExternalCameras(e.target.value === "" ? null : e.target.value === "true")}><option value="">Não informado</option><option value="true">Possui</option><option value="false">Não possui</option></select>
                      <span>Câmeras externas</span>
                    </label>
                    <label className={styles.toggleItem}>
                      <select aria-label="Alarme de fumaça" value={smokeAlarm === null ? "" : String(smokeAlarm)} onChange={(e) => setSmokeAlarm(e.target.value === "" ? null : e.target.value === "true")}><option value="">Não informado</option><option value="true">Possui</option><option value="false">Não possui</option></select>
                      <span>Alarme de fumaça</span>
                    </label>
                    <label className={styles.toggleItem}>
                      <select aria-label="Extintor de incêndio" value={fireExtinguisher === null ? "" : String(fireExtinguisher)} onChange={(e) => setFireExtinguisher(e.target.value === "" ? null : e.target.value === "true")}><option value="">Não informado</option><option value="true">Possui</option><option value="false">Não possui</option></select>
                      <span>Extintor de incêndio</span>
                    </label>
                    <label className={styles.toggleItem}>
                      <select aria-label="Portaria 24h" value={doorman24h === null ? "" : String(doorman24h)} onChange={(e) => setDoorman24h(e.target.value === "" ? null : e.target.value === "true")}><option value="">Não informado</option><option value="true">Possui</option><option value="false">Não possui</option></select>
                      <span>Portaria 24h</span>
                    </label>
                    <label className={styles.toggleItem}>
                      <select aria-label="Kit primeiros socorros" value={firstAidKit === null ? "" : String(firstAidKit)} onChange={(e) => setFirstAidKit(e.target.value === "" ? null : e.target.value === "true")}><option value="">Não informado</option><option value="true">Possui</option><option value="false">Não possui</option></select>
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
                disabled={!!myOrg && !["OWNER", "ADMIN"].includes(myOrg.role)}
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
                disabled={!!myOrg && !["OWNER", "ADMIN"].includes(myOrg.role)}
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
      {(
        <div className={styles.stepContent} hidden={activeStep !== 6}>
          <section className={styles.section} aria-label="Revisão do anúncio">
            <h2>Revise antes de publicar</h2>
            <p>{isOrg ? "O anúncio será enviado para aprovação da própria imobiliária antes de aparecer na busca." : "Após a validação dos campos, seu anúncio será publicado diretamente, sem aprovação editorial prévia."} A verificação da imobiliária é independente e não garante a autenticidade do imóvel.</p>
            {pendingIssues.length > 0 && <div role="status"><h3>Pendências para publicar</h3><ul>{pendingIssues.map(issue => <li key={issue.field}><button type="button" onClick={() => { setCurrentStep(issue.step); setStepError(issue.message); requestAnimationFrame(() => document.getElementById(issue.field)?.focus()); }}>{issue.message}</button></li>)}</ul></div>}
            <dl>
              <dt>Modalidade e apresentação <button type="button" onClick={() => setCurrentStep(1)}>Editar</button></dt>
              <dd>{modality === "venda" ? "Venda" : modality === "mensal" ? "Aluguel mensal" : "Temporada"} · {type} · {name || "Título não informado"}<p>{description || "Descrição não informada"}</p></dd>
              <dt>Características <button type="button" onClick={() => setCurrentStep(2)}>Editar</button></dt>
              <dd>{structureConfirmed ? `${bedrooms} quartos, ${suites} suítes, ${bathrooms} banheiros e ${parking} vagas` : "Quantidades não confirmadas"}. Área privativa: {privateArea || "não informada"}; total: {totalArea || "não informada"}. {isFurnished ? "Mobiliado" : "Mobiliário não confirmado"}. Comodidades: {visibleAmenities.join(", ") || "nenhuma confirmada"}.</dd>
              <dt>Localização <button type="button" onClick={() => setCurrentStep(3)}>Editar</button></dt>
              <dd>{[logradouro, numero, complemento, bairro, cidade, uf, cep].filter(Boolean).join(" · ") || "Não informada"}</dd>
              <dt>Valores e regras <button type="button" onClick={() => setCurrentStep(4)}>Editar</button></dt>
              <dd>Preço: {Number(price) > 0 ? Number(price).toLocaleString("pt-BR", {style: "currency", currency: "BRL"}) : "não informado"}. Negociação: {acceptsNegotiation ? "aceita" : "não autorizada"}.
                {modality === "venda" && <p>Condomínio: {condoFee || "não informado"}; IPTU anual: {iptuAnnual || "não informado"}; financiamento: {acceptsFinancing ? "sim" : "não confirmado"}; permuta: {acceptsExchange ? "sim" : "não confirmada"}.</p>}
                {modality === "mensal" && <p>Condomínio: {condoFee || "não informado"}; IPTU mensal: {iptuMonthly || "não informado"}; disponibilidade: {availableFrom || "não informada"}; prazo mínimo: {minimumLeaseMonths || "não informado"}; garantias: {guaranteeTypes.join(", ") || "não informadas"}; pets: {allowPetsMonthly ? "permitidos" : "não autorizados"}.</p>}
                {modality === "diaria" && <><p>Até {customMaxGuests} hóspedes; mínimo de {minimumNights} noites; limpeza: {cleaningFee || "não informada"}; entrada: {checkInTime}; saída: {checkOutTime}; pets: {allowPetsDaily ? "permitidos" : "não autorizados"}; fumar: {allowSmoking ? "permitido" : "não autorizado"}; festas: {allowParties ? "permitidas" : "não autorizadas"}; silêncio: {quietHours}; {customNotes}. Cancelamento: {cancellationPolicy}.</p><p>Segurança: {Object.entries({"Câmeras externas": externalCameras, "Alarme de fumaça": smokeAlarm, "Extintor": fireExtinguisher, "Portaria 24h": doorman24h, "Primeiros socorros": firstAidKit}).map(([label, value]) => `${label}: ${value === null ? "não informado" : value ? "possui" : "não possui"}`).join("; ")}.</p></>}
              </dd>
            </dl>
            <p>{imageCount} foto(s) selecionada(s). A primeira foto será a capa.</p>
          </section>
          <div className={styles.finalStepGrid}>
            <div className={styles.finalStepLeft}>
              <section className={styles.section}>
                <div className={styles.sectionHeader}>
                  <div className={styles.sectionIconWrap}>
                    <Camera size={22} />
                  </div>
                  <div>
                    <h2 className={styles.sectionTitle}>Fotos do imóvel</h2>
                    <p className={styles.sectionSubtitle}>Adicione fotos de alta qualidade para atrair mais interessados</p>
                  </div>
                </div>

                <MultiImageInput key={draftRevision} name="images" initialFiles={draftFiles} onFilesChange={(count, files) => { setImageCount(count); filesRef.current = files; }} />
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
                  <span>{imageCount > 0 ? `${imageCount} foto(s) selecionada(s) na galeria` : "Adicione fotos na galeria"}</span>
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
                    <span>{structureConfirmed ? `${bedrooms} quarto(s)` : "Quartos não confirmados"}</span>
                    <span>•</span>
                    <span>{structureConfirmed ? `${bathrooms} banheiro(s)` : "Banheiros não confirmados"}</span>
                  </div>

                  <div className={styles.previewPriceRow}>
                    <span className={styles.previewPriceLabel}>Valor:</span>
                    <span className={styles.previewPriceVal}>
                      {Number(price) > 0 ? Number(price).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "Preço não informado"}
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
        <div className={styles.stepErrorAlert} role="alert">
          <AlertCircle size={18} />
          <span>{state.error}</span>
        </div>
      )}

      {/* ── BARRA FIXA DE NAVEGAÇÃO INFERIOR ── */}
      <div ref={footerRef} className={styles.wizardNavFooter}>
        {draftMessage && <p className={styles.actionStatus} role="status">{draftMessage}</p>}
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
            <button type="button" className={styles.secondaryButton} onClick={() => openSidebar()} aria-label="Abrir Mensagens"><MessageCircle size={16} />Mensagens{unreadCount > 0 ? ` (${unreadCount})` : ""}</button>
            <button type="button" className={styles.secondaryButton} disabled={pending || savingDraft} onClick={saveDraft}><Save size={16} />{savingDraft ? "Salvando…" : "Salvar rascunho"}</button>
            {!isLastStep ? (
              <button type="button" onClick={validateAndNext} className={styles.button}>
                <span>Continuar</span>
                <ArrowRight size={16} />
              </button>
            ) : (
              <>

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
