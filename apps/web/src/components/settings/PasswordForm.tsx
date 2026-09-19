"use client";

import { useState } from "react";
import { Lock, CheckCircle2, AlertCircle, KeyRound } from "lucide-react";
import { getPublicApiUrl } from "@/lib/public-api";
import styles from "./SettingsForms.module.css";

interface PasswordFormProps {
  token: string;
}

export function PasswordForm({ token }: PasswordFormProps) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword) {
      setError("Informe a senha atual.");
      return;
    }
    if (newPassword.length < 6) {
      setError("A nova senha deve ter no mínimo 6 caracteres.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("A confirmação da nova senha não confere.");
      return;
    }

    setPending(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`${getPublicApiUrl()}/auth/password`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setError(data?.error ?? data?.message ?? "Não foi possível alterar a senha.");
        return;
      }

      setSuccess("Senha alterada com sucesso!");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch {
      setError("Erro na conexão com o servidor.");
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className={styles.form}>
      <div className={styles.fieldGroup}>
        <label htmlFor="currentPassword" className={styles.label}>
          <Lock size={16} />
          Senha Atual
        </label>
        <input
          id="currentPassword"
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          required
          className={styles.input}
          placeholder="••••••••"
        />
      </div>

      <div className={styles.fieldRow}>
        <div className={styles.fieldGroup}>
          <label htmlFor="newPassword" className={styles.label}>
            <KeyRound size={16} />
            Nova Senha
          </label>
          <input
            id="newPassword"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={6}
            className={styles.input}
            placeholder="No mínimo 6 caracteres"
          />
        </div>

        <div className={styles.fieldGroup}>
          <label htmlFor="confirmPassword" className={styles.label}>
            <KeyRound size={16} />
            Confirmar Nova Senha
          </label>
          <input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={6}
            className={styles.input}
            placeholder="Repita a nova senha"
          />
        </div>
      </div>

      {error && (
        <div className={styles.errorAlert}>
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className={styles.successAlert}>
          <CheckCircle2 size={16} />
          <span>{success}</span>
        </div>
      )}

      <button type="submit" disabled={pending} className={styles.submitButton}>
        <Lock size={16} />
        {pending ? "Alterando…" : "Atualizar Senha"}
      </button>
    </form>
  );
}
