"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { getPublicApiUrl } from "@/lib/public-api";
import styles from "@/components/settings/SettingsForms.module.css";
type Values = { name: string; logo: string | null; coverUrl: string | null; description: string | null; publicLocation: string | null; phone: string | null; email: string | null };
export function ShowcaseForm({ initial, token }: { initial: Values; token: string }) {
  const [values, setValues] = useState(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const router = useRouter();
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setError(""); setSuccess(false);
    try {
      const response = await fetch(`${getPublicApiUrl()}/users/me/showcase`, {
        method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value?.trim() || null]))),
      });
      if (!response.ok) { const data = await response.json().catch(() => null); throw new Error(data?.error || "Não foi possível salvar."); }
      setSuccess(true); router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Erro de conexão."); }
    finally { setPending(false); }
  }
  const fields = [["name", "Nome público", "text", 120], ["logo", "URL do logo", "url", 2048], ["coverUrl", "URL da capa panorâmica", "url", 2048], ["publicLocation", "Localização pública (cidade / estado)", "text", 200], ["phone", "WhatsApp comercial (com DDD)", "tel", 30], ["email", "E-mail público", "email", 254]] as const;
  return <form onSubmit={submit} className={styles.form}>
    {fields.map(([key, label, type, maxLength]) => <div key={key} className={styles.fieldGroup}><label htmlFor={`showcase-${key}`}>{label}</label><input id={`showcase-${key}`} className={styles.input} type={type} maxLength={maxLength} required={key === "name"} minLength={key === "name" ? 2 : undefined} value={values[key] || ""} onChange={event => setValues({ ...values, [key]: event.target.value })} /></div>)}
    <p>Use URLs HTTP ou HTTPS das imagens da empresa. Deixe em branco para remover.</p>
    <div className={styles.fieldGroup}><label htmlFor="showcase-description">Descrição pública</label><textarea id="showcase-description" className={styles.input} rows={5} maxLength={3000} value={values.description || ""} onChange={event => setValues({ ...values, description: event.target.value })} /></div>
    {error && <p role="alert">{error}</p>}{success && <p role="status">Vitrine atualizada.</p>}
    <button type="submit" className={styles.submitButton} disabled={pending}>{pending ? "Salvando…" : "Salvar imobiliária"}</button>
  </form>;
}

