"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { getPublicApiUrl } from "@/lib/public-api";
import { useRouter } from "next/navigation";
import styles from "./AuthForm.module.css";

export function ForgotPasswordForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError("Informe o e-mail cadastrado.");
      return;
    }

    setPending(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`${getPublicApiUrl()}/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setError(data?.error ?? data?.message ?? "Não foi possível enviar o código.");
        return;
      }

      setSuccess("Código de 6 dígitos enviado! Se o e-mail estiver cadastrado, você receberá as instruções em instantes.");
      
      setTimeout(() => {
        router.push(`/redefinir-senha?email=${encodeURIComponent(email.trim().toLowerCase())}`);
      }, 1500);
    } catch {
      setError("Erro na conexão de rede. Tente novamente.");
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className={styles.form}>
      <div className={styles.airbnbInputGroup}>
        <div className={styles.airbnbInputField}>
          <label htmlFor="email" className={styles.airbnbLabel}>E-mail Cadastrado</label>
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
      </div>

      {error && <p className={styles.error}>{error}</p>}
      {success && (
        <div className={styles.successBox}>
          <CheckCircle2 size={16} />
          <span>{success}</span>
        </div>
      )}

      <button type="submit" className={styles.airbnbButton} disabled={pending}>
        <span>{pending ? "Enviando código…" : "Enviar Código de Recuperação"}</span>
      </button>
    </form>
  );
}
