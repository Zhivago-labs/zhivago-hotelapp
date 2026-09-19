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
  Plus,
  Minus,
  Save,
  CheckCircle2,
  Check,
  ShieldCheck,
  ArrowLeft,
  ArrowRight,
  Eye,
  AlertCircle,
} from "lucide-react";
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

const ALL_STEPS = [
  { id: 1, title: "Tipo & Objetivo", subtitle: "Defina o tipo do espaço e a modalidade" },
  { id: 2, title: "Título & Descrição", subtitle: "Apresente os diferenciais do seu imóvel" },
  { id: 3, title: "Estrutura & Comodidades", subtitle: "Quartos, banheiros, vagas e itens inclusos" },
  { id: 4, title: "Localização", subtitle: "Endereço completo e cidade" },
  // Só se aplica a aluguel: check-in/checkout, hóspedes e cancelamento não existem numa venda.
  { id: 5, title: "Regras & Segurança", subtitle: "Horários, permissões e política de cancelamento", rentalOnly: true },
  { id: 6, title: "Fotos, Preço & Prévia", subtitle: "Defina o valor, inclua fotos e publique" },
];

export function NewListingForm() {
  const [state, formAction, pending] = useActionState(createListingAction, undefined);

  // Controle de Etapa (Wizard)
  const [currentStep, setCurrentStep] = useState(1);
  const [stepError, setStepError] = useState<string | null>(null);

  // Estados dos seletores
  const [type, setType] = useState<"casa" | "apartamento">("casa");
  const [modality, setModality] = useState<"diaria" | "mensal" | "venda">("diaria");
  const category = modality === "venda" ? "venda" : "aluguel";
  const billingCycle = modality === "diaria" ? "noite" : modality === "mensal" ? "mês" : "noite";

  // Numa venda não existe check-in/checkout, hóspedes ou política de cancelamento.
  const steps = useMemo(
    () => ALL_STEPS.filter((step) => !(step.rentalOnly && modality === "venda")),
    [modality]
  );

  // Título e Descrição
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  // Características
  const [bedrooms, setBedrooms] = useState(1);
  const [bathrooms, setBathrooms] = useState(1);
  const [parking, setParking] = useState(1);

  // Precisa viver aqui (e não dentro de AmenitiesSelector) porque o componente é desmontado
  // ao sair da Etapa 3 — mantendo o estado no componente pai, a seleção sobrevive à navegação.
  const [amenities, setAmenities] = useState<string[]>([
    "cozinha",
    "wifi",
    "workspace",
    "estacionamento",
    "piscina",
    "tv",
    "ar_condicionado",
    "cameras",
  ]);

  // Estados de Regras e Segurança
  const [checkInTime, setCheckInTime] = useState("15:00");
  const [checkOutTime, setCheckOutTime] = useState("11:00");
  const [customMaxGuests, setCustomMaxGuests] = useState(2);
  const [allowPets, setAllowPets] = useState(true);
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

  // Preço e Endereço
  const [price, setPrice] = useState("");
  const [cep, setCep] = useState("");
  const [logradouro, setLogradouro] = useState("");
  const [numero, setNumero] = useState("");
  const [bairro, setBairro] = useState("");
  const [cidade, setCidade] = useState("");
  const [uf, setUf] = useState("");
  const [loadingCep, setLoadingCep] = useState(false);

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

  // Se a etapa selecionada não existir mais na lista filtrada (ex.: usuário estava em
  // "Regras & Segurança" e trocou para "venda"), usa a próxima etapa disponível para exibição
  // sem precisar de um efeito disparando setState.
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
    } else if (activeStep === 4) {
      if (!cidade.trim() || !uf.trim()) {
        setStepError("Por favor, preencha o CEP e confirme a Cidade e a UF.");
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

  // Etapa 6 não tem um botão "Continuar" que passe pelo validateAndNext — é direto pro
  // submit real. Preço e fotos só têm o `required`/checagem do servidor, então erros nelas
  // só apareceriam depois de uma ida e volta ao servidor. Intercepta aqui pra dar feedback
  // imediato, igual às outras etapas.
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
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="bedrooms" value={bedrooms} />
      <input type="hidden" name="bathrooms" value={bathrooms} />
      <input type="hidden" name="parking" value={parking} />
      <input type="hidden" name="checkInTime" value={checkInTime} />
      <input type="hidden" name="checkOutTime" value={checkOutTime} />
      <input type="hidden" name="customMaxGuests" value={customMaxGuests} />
      <input type="hidden" name="houseRules" value={JSON.stringify({ allowPets, allowSmoking, allowParties, quietHours, customNotes })} />
      <input type="hidden" name="safetyItems" value={JSON.stringify({ externalCameras, smokeAlarm, fireExtinguisher, doorman24h, firstAidKit })} />
      <input type="hidden" name="cancellationPolicy" value={cancellationPolicy} />
      {/* Título, descrição, endereço e comodidades precisam sobreviver à troca de etapa —
          seus campos visíveis só existem no DOM enquanto a etapa correspondente está ativa. */}
      <input type="hidden" name="name" value={name} />
      <input type="hidden" name="description" value={description} />
      <input type="hidden" name="logradouro" value={logradouro} />
      <input type="hidden" name="numero" value={numero} />
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

        {/* Stepper Navegável por Ícones */}
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
                <span className={styles.stepperDot}>
                  {isDone ? <Check size={12} /> : step.id}
                </span>
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
                <Tag size={22} />
              </div>
              <div>
                <h2 className={styles.sectionTitle}>Qual o objetivo da publicação?</h2>
                <p className={styles.sectionSubtitle}>Defina se o imóvel será alugado por diária, mensalmente ou vendido</p>
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
        </div>
      )}

      {/* ── ETAPA 2: TÍTULO & DESCRIÇÃO ── */}
      {activeStep === 2 && (
        <div className={styles.stepContent}>
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

      {/* ── ETAPA 3: ESTRUTURA & COMODIDADES ── */}
      {activeStep === 3 && (
        <div className={styles.stepContent}>
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionIconWrap}>
                <Sparkles size={22} />
              </div>
              <div>
                <h2 className={styles.sectionTitle}>Capacidade & Estrutura</h2>
                <p className={styles.sectionSubtitle}>Ajuste a quantidade de quartos, banheiros e vagas disponíveis</p>
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
                    <p className={styles.airbnbRowSubtitle}>Quantos quartos estão disponíveis?</p>
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

              {/* Vagas */}
              <div className={styles.airbnbRow}>
                <div className={styles.airbnbRowLeft}>
                  <div className={styles.airbnbRowIcon}>
                    <Car size={22} />
                  </div>
                  <div>
                    <p className={styles.airbnbRowTitle}>Vagas de garagem</p>
                    <p className={styles.airbnbRowSubtitle}>Vagas de estacionamento no imóvel</p>
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

      {/* ── ETAPA 4: LOCALIZAÇÃO ── */}
      {activeStep === 4 && (
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
              name="cep"
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

            <div style={{ marginTop: "16px" }}>
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
          </section>
        </div>
      )}

      {/* ── ETAPA 5: REGRAS & SEGURANÇA (somente aluguel) ── */}
      {activeStep === 5 && modality !== "venda" && (
        <div className={styles.stepContent}>
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionIconWrap}>
                <ShieldCheck size={22} />
              </div>
              <div>
                <h2 className={styles.sectionTitle}>Regras da acomodação & Segurança</h2>
                <p className={styles.sectionSubtitle}>
                  {modality === "diaria"
                    ? "Defina horários, restrições e políticas de cancelamento para seus hóspedes"
                    : "Defina restrições e itens de segurança para seus inquilinos"}
                </p>
              </div>
            </div>

            {/* Horários — check-in/checkout são conceito de hospedagem por diária;
                num contrato de aluguel mensal não existe horário de entrada/saída. */}
            {modality === "diaria" && (
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
            )}

            <div style={{ marginTop: "16px" }}>
              <label className={styles.label} htmlFor="customMaxGuests">Máximo de Hóspedes Permitidos</label>
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

            {/* Permissões / Regras */}
            <div style={{ marginTop: "24px", paddingTop: "20px", borderTop: "1px solid var(--border)" }}>
              <h3 className={styles.airbnbSubHeading}>Regras da Acomodação</h3>
              <div className={styles.toggleGrid}>
                <label className={styles.toggleItem}>
                  <input type="checkbox" checked={allowPets} onChange={(e) => setAllowPets(e.target.checked)} />
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

            {/* Dispositivos de Segurança */}
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

            {/* Política de Cancelamento — reembolso contado a partir do check-in só faz
                sentido pra hospedagem por diária; aluguel mensal segue regras de contrato. */}
            {modality === "diaria" && (
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
            )}
          </section>
        </div>
      )}

      {/* ── ETAPA 6: FOTOS, PREÇO & PRÉVIA ── */}
      {activeStep === 6 && (
        <div className={styles.stepContent}>
          <div className={styles.finalStepGrid}>
            <div className={styles.finalStepLeft}>
              {/* Preço Hero */}
              <section className={styles.section}>
                <div className={styles.sectionHeader}>
                  <div className={styles.sectionIconWrap}>
                    <Tag size={22} />
                  </div>
                  <div>
                    <h2 className={styles.sectionTitle}>Defina o valor do anúncio</h2>
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
                    name="price"
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

              {/* Upload de Fotos */}
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

            {/* Card de Prévia ao Vivo */}
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
                  <h4 className={styles.previewTitle}>
                    {name.trim() ? name : "Título do seu anúncio"}
                  </h4>
                  <p className={styles.previewLocation}>
                    <MapPin size={14} />
                    <span>
                      {cidade && uf ? `${cidade}, ${uf}` : "Cidade, UF"}
                    </span>
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
                      {price
                        ? Number(price).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
                        : "R$ 0"}
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
