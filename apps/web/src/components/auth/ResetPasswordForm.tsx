"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { getPublicApiUrl } from "@/lib/public-api";
import styles from "./AuthForm.module.css";

export function ResetPasswordForm({ initialEmail }: { initialEmail?: string }) {
  const [email, setEmail] = useState(initialEmail ?? "");
  const [token, setToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !token.trim() || !newPassword) {
      setError("Preencha todos os campos.");
      return;
    }
    if (token.trim().length !== 6) {
      setError("O código de verificação deve possuir exatamente 6 dígitos.");
      return;
    }
    if (newPassword.length < 6) {
      setError("A nova senha deve ter no mínimo 6 caracteres.");
      return;
    }

    setPending(true);
    setError(null);

    try {
      const res = await fetch(`${getPublicApiUrl()}/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          token: token.trim(),
          newPassword,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setError(data?.error ?? data?.message ?? "Código inválido ou expirado.");
        return;
      }

      setSuccess(true);
    } catch {
      setError("Erro na conexão de rede. Tente novamente.");
    } finally {
      setPending(false);
    }
  };

  if (success) {
    return (
      <div className={styles.successContainer}>
        <div className={styles.successIconCircle}>
          <CheckCircle2 size={36} />
        </div>
        <h2 className={styles.welcomeTitle}>Senha Redefinida!</h2>
        <p className={styles.welcomeSubtitle}>
          Sua senha foi redefinida com sucesso. Você já pode acessar sua conta com a nova senha criada.
        </p>
        <Link href="/login" className={styles.airbnbButton} style={{ textDecoration: "none", marginTop: "16px" }}>
          Fazer Login Agora
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className={styles.form}>
      <div className={styles.airbnbInputGroup}>
        <div className={styles.airbnbInputField}>
          <label className={styles.airbnbLabel} htmlFor="email">E-mail</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="seu@email.com"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={styles.airbnbInput}
          />
        </div>

        <div className={styles.airbnbInputField}>
          <label className={styles.airbnbLabel} htmlFor="token">Código de 6 dígitos</label>
          <input
            id="token"
            name="token"
            type="text"
            maxLength={6}
            placeholder="000000"
            required
            value={token}
            onChange={(e) => setToken(e.target.value)}
            className={styles.airbnbInput}
          />
        </div>

        <div className={styles.airbnbInputField}>
          <label className={styles.airbnbLabel} htmlFor="newPassword">Nova Senha</label>
          <input
            id="newPassword"
            name="newPassword"
            type="password"
            placeholder="No mínimo 6 caracteres"
            required
            minLength={6}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className={styles.airbnbInput}
          />
        </div>
      </div>

      {error && <p className={styles.error}>{error}</p>}

      <button type="submit" className={styles.airbnbButton} disabled={pending}>
        <span>{pending ? "Redefinindo…" : "Criar Nova Senha"}</span>
      </button>
    </form>
  );
}
