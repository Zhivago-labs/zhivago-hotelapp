"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, MediaImagePlus as ImagePlus, Trash as Trash2, Building as Building2, Phone, FloppyDisk as Save } from "iconoir-react";
import { getPublicApiUrl } from "@/lib/public-api";
import forms from "@/components/settings/SettingsForms.module.css";
import styles from "./ShowcaseForm.module.css";

type Values = {
  legalName?: string | null; address?: string | null; businessHours?: string | null; whatsapp?: string | null;
  name: string;
  logo: string | null;
  coverUrl: string | null;
  description: string | null;
  publicLocation: string | null;
  phone: string | null;
  email: string | null;
};
type ImageKind = "logo" | "cover";

/** Até 20 MB, o mesmo limite do servidor — avisa antes de gastar o upload. */
const MAX_BYTES = 20 * 1024 * 1024;

export function ShowcaseForm({ initial, token }: { initial: Values; token: string }) {
  const [values, setValues] = useState(initial);
  const [pending, setPending] = useState(false);
  const [uploading, setUploading] = useState<ImageKind | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [dirty, setDirty] = useState(false);
  const logoInput = useRef<HTMLInputElement>(null);
  const coverInput = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const set = (patch: Partial<Values>) => {
    setValues((prev) => ({ ...prev, ...patch }));
    setDirty(true);
    setSuccess("");
  };

  async function upload(kind: ImageKind, file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return setError("Escolha um arquivo de imagem (JPG, PNG ou WebP).");
    if (file.size > MAX_BYTES) return setError("Imagem muito grande. O limite é 20 MB.");
    setUploading(kind);
    setError("");
    setSuccess("");
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch(`${getPublicApiUrl()}/users/me/showcase/image?kind=${kind}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body,
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.url) throw new Error(data?.error || "Não foi possível enviar a imagem.");
      set(kind === "logo" ? { logo: data.url } : { coverUrl: data.url });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro de conexão.");
    } finally {
      setUploading(null);
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch(`${getPublicApiUrl()}/users/me/showcase`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(
          Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value?.trim() || null]))
        ),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || "Não foi possível salvar.");
      }
      setDirty(false);
      setSuccess("Imobiliária atualizada! As mudanças já aparecem na vitrine.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro de conexão.");
    } finally {
      setPending(false);
    }
  }

  const initials = values.name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join("").toUpperCase();
  const busy = pending || uploading !== null;

  return (
    <form onSubmit={submit} className={forms.form}>
      {/* ── Capa e logo, no mesmo arranjo da vitrine ── */}
      <section className={styles.section} aria-labelledby="showcase-images">
        <h2 id="showcase-images" className={styles.sectionTitle}><Camera width={18} height={18} /> Capa e logo</h2>

        <div className={styles.cover}>
          {values.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={values.coverUrl} alt="Prévia da capa" className={styles.coverImage} />
          ) : (
            <span className={styles.coverEmpty}>Sem foto de capa</span>
          )}
          {uploading === "cover" && <span className={styles.overlaySpinner} aria-label="Enviando capa" />}
          <div className={styles.coverActions}>
            <button type="button" className={styles.overlayButton} disabled={busy} onClick={() => coverInput.current?.click()}>
              <ImagePlus width={15} height={15} /> {values.coverUrl ? "Trocar capa" : "Enviar capa"}
            </button>
            {values.coverUrl && (
              <button type="button" className={styles.overlayButton} disabled={busy} onClick={() => set({ coverUrl: null })} aria-label="Remover capa">
                <Trash2 width={15} height={15} />
              </button>
            )}
          </div>
        </div>

        <div className={styles.logoRow}>
          <div className={styles.logo}>
            {values.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={values.logo} alt="Prévia do logo" />
            ) : (
              <span>{initials || "?"}</span>
            )}
            {uploading === "logo" && <span className={styles.overlaySpinner} aria-label="Enviando logo" />}
          </div>
          <div className={styles.logoActions}>
            <div className={styles.buttonRow}>
              <button type="button" className={forms.avatarButton} disabled={busy} onClick={() => logoInput.current?.click()}>
                <ImagePlus width={15} height={15} /> {values.logo ? "Trocar logo" : "Enviar logo"}
              </button>
              {values.logo && (
                <button type="button" className={forms.avatarButton} disabled={busy} onClick={() => set({ logo: null })}>
                  <Trash2 width={15} height={15} /> Remover
                </button>
              )}
            </div>
            <p className={forms.avatarHint}>
              Logo: imagem quadrada fica melhor. Capa: foto larga (horizontal), por exemplo da fachada ou de um imóvel.
            </p>
          </div>
        </div>

        <input ref={logoInput} type="file" accept="image/*" className={forms.hiddenFileInput}
          onChange={(e) => { void upload("logo", e.target.files?.[0]); e.target.value = ""; }} />
        <input ref={coverInput} type="file" accept="image/*" className={forms.hiddenFileInput}
          onChange={(e) => { void upload("cover", e.target.files?.[0]); e.target.value = ""; }} />
      </section>

      {/* ── Informações ── */}
      <section className={styles.section} aria-labelledby="showcase-info">
        <h2 id="showcase-info" className={styles.sectionTitle}><Building2 width={18} height={18} /> Informações</h2>
        <div className={forms.fieldRow}>
          <div className={forms.fieldGroup}>
            <label className={forms.label} htmlFor="showcase-name">Nome da imobiliária</label>
            <input id="showcase-name" className={forms.input} required minLength={2} maxLength={120}
              value={values.name} onChange={(e) => set({ name: e.target.value })} />
          </div>
          <div className={forms.fieldGroup}>
            <label className={forms.label} htmlFor="showcase-location">Cidade / estado</label>
            <input id="showcase-location" className={forms.input} maxLength={200} placeholder="Ex.: Santos, SP"
              value={values.publicLocation || ""} onChange={(e) => set({ publicLocation: e.target.value })} />
          </div>
        </div>
        <div className={forms.fieldGroup}>
          <label className={forms.label} htmlFor="showcase-description">Sobre a imobiliária</label>
          <textarea id="showcase-description" className={`${forms.input} ${styles.textarea}`} rows={5} maxLength={3000}
            placeholder="Conte há quanto tempo atuam, regiões e tipos de imóvel em que são especialistas…"
            value={values.description || ""} onChange={(e) => set({ description: e.target.value })} />
          <span className={styles.counter}>{(values.description || "").length} / 3000</span>
        </div>
      </section>

      {/* ── Contato ── */}
      <section className={styles.section} aria-labelledby="showcase-contact">
        <h2 id="showcase-contact" className={styles.sectionTitle}><Phone width={18} height={18} /> Contato público</h2>
        <div className={forms.fieldRow}>
          <div className={forms.fieldGroup}>
            <label className={forms.label} htmlFor="showcase-phone">Telefone comercial (com DDD)</label>
            <input id="showcase-phone" className={forms.input} type="tel" maxLength={30} placeholder="(11) 99999-0000"
              value={values.phone || ""} onChange={(e) => set({ phone: e.target.value })} />
          </div>
          <div className={forms.fieldGroup}>
            <label className={forms.label} htmlFor="showcase-email">E-mail público</label>
            <input id="showcase-email" className={forms.input} type="email" maxLength={254} placeholder="contato@suaimobiliaria.com.br"
              value={values.email || ""} onChange={(e) => set({ email: e.target.value })} />
          </div>
        </div>
        <p className={forms.avatarHint}>O contato da vitrine usa o WhatsApp cadastrado, o telefone comercial ou o e-mail comercial.</p>
      </section>

      {initial.legalName !== undefined && <section className={styles.section} aria-label="Dados da empresa">
        <h2 className={styles.sectionTitle}>Dados da empresa</h2>
        <p className={forms.avatarHint}>Razão social e endereço completo são internos. Nome comercial, logo, capa, descrição, cidade, telefone, WhatsApp, e-mail e horário de atendimento são públicos. Nenhum dado pessoal é copiado.</p>
        {([["legalName", "Razão social (interna)", 200], ["address", "Endereço completo (interno)", 500], ["businessHours", "Horário de atendimento (público)", 500], ["whatsapp", "WhatsApp comercial (público, com DDD)", 30]] as const).map(([key, label, maxLength]) => <div className={forms.fieldGroup} key={key}>
          <label className={forms.label} htmlFor={key}>{label}</label>
          <input id={key} className={forms.input} maxLength={maxLength} type={key === "whatsapp" ? "tel" : "text"} value={values[key] || ""} onChange={event => set({ [key]: event.target.value })} />
        </div>)}
      </section>}
      {error && <p role="alert" className={forms.errorAlert}>{error}</p>}
      {success && <p role="status" className={forms.successAlert}>{success}</p>}

      <div className={styles.footer}>
        <button type="submit" className={forms.submitButton} disabled={busy}>
          <Save width={16} height={16} /> {pending ? "Salvando…" : "Salvar alterações"}
        </button>
        {dirty && !pending && <span className={styles.unsaved}>Há alterações não salvas</span>}
      </div>
    </form>
  );
}
