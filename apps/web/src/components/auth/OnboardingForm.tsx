"use client";

import { useActionState, useState } from "react";
import Image from "next/image";
import { User, Building2 } from "lucide-react";
import { completeOnboardingAction } from "@/lib/actions/auth";
import styles from "./AuthForm.module.css";

type UsageType = "INDIVIDUAL" | "AGENCY";

const OPTIONS: { value: UsageType; title: string; text: string; Icon: typeof User }[] = [
  {
    value: "INDIVIDUAL",
    title: "Uso pessoal",
    text: "Quero alugar, comprar ou anunciar meus próprios imóveis.",
    Icon: User,
  },
  {
    value: "AGENCY",
    title: "Imobiliário",
    text: "Sou imobiliária ou corretor e quero gerenciar carteira, equipe e leads.",
    Icon: Building2,
  },
];

export function OnboardingForm({ firstName, next }: { firstName: string; next?: string }) {
  const [state, formAction, pending] = useActionState(completeOnboardingAction, undefined);
  const [usage, setUsage] = useState<UsageType>("INDIVIDUAL");

  return (
    <form action={formAction} className={styles.form}>
      {next && <input type="hidden" name="next" value={next} />}
      <input type="hidden" name="accountType" value={usage} />

      <div className={styles.brandHeader}>
        <Image
          src="/images/system/Gemini_Generated_Image_(1).png"
          alt="Zhivago Logo"
          width={129}
          height={38}
          className={styles.brandLogo}
          priority
        />
        <h1 className={styles.welcomeTitle}>Olá, {firstName}! Como você vai usar o Zhivago?</h1>
        <p className={styles.welcomeSubtitle}>Escolha o tipo de uso para personalizarmos sua conta</p>
      </div>

      <div className={styles.usageOptions} role="radiogroup" aria-label="Tipo de uso">
        {OPTIONS.map(({ value, title, text, Icon }) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={usage === value}
            className={`${styles.usageOption} ${usage === value ? styles.usageOptionActive : ""}`}
            onClick={() => setUsage(value)}
          >
            <Icon size={20} />
            <span className={styles.usageOptionTitle}>{title}</span>
            <span className={styles.usageOptionText}>{text}</span>
          </button>
        ))}
      </div>

      {usage === "AGENCY" && (
        <div className={styles.airbnbInputGroup}>
          <div className={styles.airbnbInputField}>
            <label htmlFor="companyName" className={styles.airbnbLabel}>Nome Fantasia</label>
            <input
              id="companyName"
              name="companyName"
              type="text"
              placeholder="Nome da sua imobiliária"
              required
              className={styles.airbnbInput}
            />
          </div>

          <div className={styles.airbnbInputField}>
            <label htmlFor="document" className={styles.airbnbLabel}>CNPJ (ou CPF)</label>
            <input
              id="document"
              name="document"
              type="text"
              placeholder="00.000.000/0000-00"
              required
              className={styles.airbnbInput}
            />
          </div>

          <div className={styles.airbnbInputField}>
            <label htmlFor="creci" className={styles.airbnbLabel}>CRECI (opcional)</label>
            <input
              id="creci"
              name="creci"
              type="text"
              placeholder="Registro CRECI"
              className={styles.airbnbInput}
            />
          </div>
        </div>
      )}

      <p className={styles.legalDisclaimer}>
        Ao selecionar <strong>Concordar e continuar</strong>, você aceita os{" "}
        <a href="/termos" target="_blank" rel="noopener noreferrer">Termos de Uso</a> e a{" "}
        <a href="/privacidade" target="_blank" rel="noopener noreferrer">Política de Privacidade</a>.
      </p>

      {state?.error && <p className={styles.error}>{state.error}</p>}

      <button type="submit" className={styles.airbnbButton} disabled={pending}>
        <span>{pending ? "Salvando…" : "Concordar e continuar"}</span>
      </button>
    </form>
  );
}
