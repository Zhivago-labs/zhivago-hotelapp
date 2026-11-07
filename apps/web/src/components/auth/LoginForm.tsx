"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Eye, EyeOff } from "lucide-react";
import { loginAction } from "@/lib/actions/auth";
import { GoogleSignInButton } from "./GoogleSignInButton";
import { FeedbackNotice } from "@/components/feedback/FeedbackNotice";
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
        <p className={styles.welcomeSubtitle}>{next?.startsWith("/anuncios/novo") ? "Entre para cadastrar seu imóvel" : "Entre para gerenciar seus anúncios, favoritos e mensagens"}</p>
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

      {state?.error && <FeedbackNotice>{state.error}</FeedbackNotice>}

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
