"use client";

import { useRef, useState } from "react";
import { User, Phone, Building2, FileText, CheckCircle2, AlertCircle, Save, Camera } from "lucide-react";
import { getPublicApiUrl } from "@/lib/public-api";
import { useRouter } from "next/navigation";
import styles from "./SettingsForms.module.css";

interface ProfileFormProps {
  initialName: string;
  initialPhone?: string | null;
  initialAvatar?: string | null;
  initialCompanyName?: string | null;
  initialCreci?: string | null;
  isAgency: boolean;
  token: string;
}

export function ProfileForm({
  initialName,
  initialPhone,
  initialAvatar,
  initialCompanyName,
  initialCreci,
  isAgency,
  token,
}: ProfileFormProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(initialName);
  const [phone, setPhone] = useState(initialPhone ?? "");
  const [companyName, setCompanyName] = useState(initialCompanyName ?? "");
  const [creci, setCreci] = useState(initialCreci ?? "");
  const [avatar, setAvatar] = useState(initialAvatar ?? null);
  const [pending, setPending] = useState(false);
  const [avatarPending, setAvatarPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const avatarUrl = avatar ?? `https://ui-avatars.com/api/?name=${encodeURIComponent(name || "?")}&background=f1f5f9`;

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setAvatarPending(true);
    setError(null);
    setSuccess(null);

    try {
      const formData = new FormData();
      formData.append("avatar", file);

      const res = await fetch(`${getPublicApiUrl()}/auth/me/avatar`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setError(data?.error ?? "Não foi possível atualizar a foto. Tente uma imagem menor.");
        return;
      }

      setAvatar(data.avatar);
      setSuccess("Foto de perfil atualizada!");
      router.refresh();
    } catch {
      setError("Erro na conexão com o servidor.");
    } finally {
      setAvatarPending(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("O nome é obrigatório.");
      return;
    }

    setPending(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`${getPublicApiUrl()}/auth/me`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim() || undefined,
          ...(isAgency ? { companyName: companyName.trim(), creci: creci.trim() } : {}),
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setError(data?.error ?? data?.message ?? "Não foi possível atualizar o perfil.");
        return;
      }

      setSuccess("Perfil atualizado com sucesso!");
      router.refresh();
    } catch {
      setError("Erro na conexão com o servidor.");
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className={styles.form}>
      <div className={styles.avatarRow}>
        <div className={styles.avatarPreviewWrap}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={avatarUrl} alt={name} className={styles.avatarPreview} />
          {avatarPending && <span className={styles.avatarSpinner} />}
        </div>
        <div>
          <button
            type="button"
            className={styles.avatarButton}
            onClick={() => fileInputRef.current?.click()}
            disabled={avatarPending}
          >
            <Camera size={15} />
            {avatarPending ? "Enviando…" : "Trocar foto"}
          </button>
          <p className={styles.avatarHint}>Essa foto aparece na sua vitrine pública e nos seus anúncios.</p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className={styles.hiddenFileInput}
            onChange={handleAvatarChange}
          />
        </div>
      </div>

      <div className={styles.fieldGroup}>
        <label htmlFor="name" className={styles.label}>
          <User size={16} />
          Nome Completo
        </label>
        <input
          id="name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className={styles.input}
          placeholder="Seu nome"
        />
      </div>

      <div className={styles.fieldGroup}>
        <label htmlFor="phone" className={styles.label}>
          <Phone size={16} />
          Telefone / WhatsApp
        </label>
        <input
          id="phone"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className={styles.input}
          placeholder="(11) 99999-9999"
        />
      </div>

      {isAgency && (
        <div className={styles.fieldRow}>
          <div className={styles.fieldGroup}>
            <label htmlFor="companyName" className={styles.label}>
              <Building2 size={16} />
              Nome Fantasia
            </label>
            <input
              id="companyName"
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className={styles.input}
              placeholder="Nome exibido na vitrine"
            />
          </div>

          <div className={styles.fieldGroup}>
            <label htmlFor="creci" className={styles.label}>
              <FileText size={16} />
              CRECI
            </label>
            <input
              id="creci"
              type="text"
              value={creci}
              onChange={(e) => setCreci(e.target.value)}
              className={styles.input}
              placeholder="Nº de registro"
            />
          </div>
        </div>
      )}

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
        <Save size={16} />
        {pending ? "Salvando…" : "Salvar Alterações"}
      </button>
    </form>
  );
}
