"use client";

import { useActionState } from "react";
import { importListingsAction } from "@/lib/actions/listings";
import formStyles from "./ListingForm.module.css";
import styles from "./ImportListingsForm.module.css";

export function ImportListingsForm() {
  const [state, formAction, pending] = useActionState(importListingsAction, undefined);

  const result = state && "createdCount" in state ? state : null;
  const error = state && "error" in state ? state.error : null;

  return (
    <form action={formAction} className={formStyles.form}>
      <section className={formStyles.section}>
        <h2 className={formStyles.sectionTitle}>Arquivo CSV</h2>
        <p className={styles.hint}>
          Baixe o{" "}
          <a href="/modelo-importacao-anuncios.csv" download className={styles.templateLink}>
            modelo de planilha
          </a>{" "}
          e preencha uma linha por anúncio. Cada anúncio nasce como <strong>rascunho</strong> — revise e publique
          depois, um a um ou pelo botão “Publicar” de cada card. A coluna <code>imagens</code> deve trazer uma ou
          mais URLs já hospedadas (separadas por <code>|</code>), já que não há upload de arquivo aqui.
        </p>

        <label className={formStyles.label} htmlFor="file">
          Arquivo (.csv) *
        </label>
        <input id="file" name="file" type="file" accept=".csv,text/csv" required className={formStyles.input} />
      </section>

      {error && <p className={formStyles.error}>{error}</p>}

      <div className={formStyles.submitRow}>
        <button type="submit" className={formStyles.button} disabled={pending}>
          {pending ? "Importando…" : "Importar anúncios"}
        </button>
      </div>

      {result && (
        <section className={formStyles.section}>
          <h2 className={formStyles.sectionTitle}>Resultado da importação</h2>
          <p className={styles.summary}>
            {result.createdCount === 0
              ? "Nenhum anúncio foi criado."
              : `${result.createdCount} anúncio(s) criado(s) como rascunho.`}
          </p>

          {result.errors.length > 0 && (
            <>
              <p className={styles.summaryError}>
                {result.errors.length} linha(s) não puderam ser importadas:
              </p>
              <ul className={styles.errorList}>
                {result.errors.map((rowError) => (
                  <li key={rowError.row} className={styles.errorItem}>
                    <strong>Linha {rowError.row}:</strong> {rowError.messages.join("; ")}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}
    </form>
  );
}
