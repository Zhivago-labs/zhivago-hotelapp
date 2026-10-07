"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Eye, EyeOff } from "lucide-react";
import { loginAction } from "@/lib/actions/auth";
import { GoogleSignInButton } from "./GoogleSignInButton";
import styles from "./AuthForm.module.css";

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction, pending] = useActionState(loginAction, undefined);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form action={formAction} className={styles.form}>
      {next && <input type="hidden" name="next" value={next} />}

      {/* Hero de Marca Limpo */}
      <div className={styles.brandHeader}>
        <Link href="/" className={styles.logoLink} title="Ir para o início">
          <Image
            src="/images/system/Gemini_Generated_Image_(1).png"
            alt="Zhivago Logo"
            width={129}
            height={38}
            className={styles.brandLogo}
            priority
          />
        </Link>
        <h1 className={styles.welcomeTitle}>Boas-vindas ao Zhivago</h1>
        <p className={styles.welcomeSubtitle}>Entre para gerenciar reservas e explorar anúncios</p>
      </div>

      {/* Caixa de Inputs Agrupados Estilo Airbnb */}
      <div className={styles.airbnbInputGroup}>
        <div className={styles.airbnbInputField}>
          <label htmlFor="email" className={styles.airbnbLabel}>E-mail</label>
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
          <label htmlFor="password" className={styles.airbnbLabel}>Senha</label>
          <div className={styles.passwordWrap}>
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="Digite sua senha"
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
      </div>

      {/* Link Esqueceu a Senha */}
      <div className={styles.forgotPasswordRow}>
        <Link href="/esqueci-senha" className={styles.forgotLink}>
          Esqueceu sua senha?
        </Link>
      </div>

      {state?.error && <p className={styles.error}>{state.error}</p>}

      {/* Botão Coral Airbnb */}
      <button type="submit" className={styles.airbnbButton} disabled={pending}>
        <span>{pending ? "Entrando…" : "Continuar"}</span>
      </button>

      <div className={styles.dividerRow}>
        <span className={styles.dividerLine} />
        <span className={styles.dividerText}>ou</span>
        <span className={styles.dividerLine} />
      </div>

      {/* Botões Sociais Estilo Airbnb */}
      <div className={styles.socialButtons}>
        <GoogleSignInButton next={next} />

        <button
          type="button"
          className={styles.socialButton}
          onClick={() => alert("Login via Apple em breve!")}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className={styles.socialIcon}>
            <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.35c.66-.8 1.11-1.92.99-3.04-.96.04-2.12.64-2.8 1.44-.6.7-1.13 1.83-.99 2.94 1.07.08 2.14-.54 2.8-1.34z"/>
          </svg>
          <span>Continuar com Apple</span>
        </button>
      </div>

      <div className={styles.footerRow}>
        <span>Ainda não tem conta no Zhivago?</span>{" "}
        <Link href={next ? `/cadastro?next=${encodeURIComponent(next)}` : "/cadastro"} className={styles.airbnbLink}>
          Cadastre-se
        </Link>
      </div>
    </form>
  );
}
