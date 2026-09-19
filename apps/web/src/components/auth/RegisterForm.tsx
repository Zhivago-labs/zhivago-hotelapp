"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Eye, EyeOff, User, Building2 } from "lucide-react";
import { registerAction } from "@/lib/actions/auth";
import styles from "./AuthForm.module.css";

export function RegisterForm({ next }: { next?: string }) {
  const [state, formAction, pending] = useActionState(registerAction, undefined);
  const [accountType, setAccountType] = useState<"INDIVIDUAL" | "AGENCY">("INDIVIDUAL");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  return (
    <form action={formAction} className={styles.form}>
      {next && <input type="hidden" name="next" value={next} />}

      {/* Hero de Marca Limpo */}
      <div className={styles.brandHeader}>
        <Link href="/" className={styles.logoLink} title="Ir para o início">
          <Image
            src="/images/system/Gemini_Generated_Image_(1).png"
            alt="Zhivago Logo"
            width={170}
            height={50}
            className={styles.brandLogo}
            priority
          />
        </Link>
        <h1 className={styles.welcomeTitle}>Crie sua conta no Zhivago</h1>
        <p className={styles.welcomeSubtitle}>Escolha seu perfil para começar</p>
      </div>

      {/* Seleção do Tipo de Conta Estilo Airbnb Tabs */}
      <div className={styles.airbnbTypeSelector}>
        <button
          type="button"
          className={`${styles.airbnbTypeTab} ${accountType === "INDIVIDUAL" ? styles.airbnbTypeTabActive : ""}`}
          onClick={() => setAccountType("INDIVIDUAL")}
        >
          <User size={16} />
          <span>Pessoa Física</span>
        </button>
        <button
          type="button"
          className={`${styles.airbnbTypeTab} ${accountType === "AGENCY" ? styles.airbnbTypeTabActive : ""}`}
          onClick={() => setAccountType("AGENCY")}
        >
          <Building2 size={16} />
          <span>Imobiliária</span>
        </button>
      </div>
      <input type="hidden" name="accountType" value={accountType} />

      {/* Bloco de Inputs Agrupados Estilo Airbnb */}
      <div className={styles.airbnbInputGroup}>
        <div className={styles.airbnbInputField}>
          <label htmlFor="name" className={styles.airbnbLabel}>
            {accountType === "AGENCY" ? "Nome do Responsável" : "Nome Completo"}
          </label>
          <input
            id="name"
            name="name"
            type="text"
            autoComplete="name"
            placeholder={accountType === "AGENCY" ? "Nome do gestor ou corretor" : "Como consta no seu documento"}
            required
            className={styles.airbnbInput}
          />
        </div>

        {accountType === "AGENCY" && (
          <>
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
          </>
        )}

        <div className={styles.airbnbInputField}>
          <label htmlFor="email" className={styles.airbnbLabel}>E-mail de Acesso</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="seu@email.com"
            required
            className={styles.airbnbInput}
          />
        </div>

        <div className={styles.airbnbInputField}>
          <label htmlFor="password" className={styles.airbnbLabel}>Crie uma Senha</label>
          <div className={styles.passwordWrap}>
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              placeholder="Mínimo 6 caracteres"
              required
              className={styles.airbnbInput}
            />
            <button
              type="button"
              className={styles.togglePasswordBtn}
              onClick={() => setShowPassword(!showPassword)}
              tabIndex={-1}
              aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        <div className={styles.airbnbInputField}>
          <label htmlFor="confirmPassword" className={styles.airbnbLabel}>Confirme a Senha</label>
          <div className={styles.passwordWrap}>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type={showConfirmPassword ? "text" : "password"}
              autoComplete="new-password"
              placeholder="Digite a senha novamente"
              required
              className={styles.airbnbInput}
            />
            <button
              type="button"
              className={styles.togglePasswordBtn}
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              tabIndex={-1}
              aria-label={showConfirmPassword ? "Ocultar senha" : "Mostrar senha"}
            >
              {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>
      </div>

      <p className={styles.legalDisclaimer}>
        Ao selecionar <strong>Concordar e continuar</strong>, você aceita os Termos de Serviço e Política de Privacidade.
      </p>

      {state?.error && <p className={styles.error}>{state.error}</p>}

      {/* Botão Coral Airbnb */}
      <button type="submit" className={styles.airbnbButton} disabled={pending}>
        <span>{pending ? "Criando conta…" : "Concordar e continuar"}</span>
      </button>

      <div className={styles.dividerRow}>
        <span className={styles.dividerLine} />
        <span className={styles.dividerText}>ou</span>
        <span className={styles.dividerLine} />
      </div>

      <div className={styles.footerRow}>
        <span>Já possui uma conta?</span>{" "}
        <Link href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"} className={styles.airbnbLink}>
          Fazer login
        </Link>
      </div>
    </form>
  );
}
