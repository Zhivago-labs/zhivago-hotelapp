"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import shared from "./shared.module.css";
import styles from "./HomeHero.module.css";

type Operation = "" | "venda" | "aluguel" | "temporada";

const OPERATIONS: { value: Operation; label: string }[] = [
  { value: "", label: "Todos" },
  { value: "venda", label: "Comprar" },
  { value: "aluguel", label: "Alugar" },
  { value: "temporada", label: "Temporada" },
];

// Faixas por operação — compra, aluguel mensal e diária têm escalas de preço diferentes.
// O valor é "min-max" (lados vazios = sem limite) e vira ?precoMin=&precoMax= no /imoveis.
const PRICE_RANGES: Record<Exclude<Operation, "">, { value: string; label: string }[]> = {
  venda: [
    { value: "-300000", label: "Até R$ 300 mil" },
    { value: "300000-600000", label: "R$ 300 mil a R$ 600 mil" },
    { value: "600000-1000000", label: "R$ 600 mil a R$ 1 milhão" },
    { value: "1000000-", label: "Acima de R$ 1 milhão" },
  ],
  aluguel: [
    { value: "-1500", label: "Até R$ 1.500/mês" },
    { value: "1500-3000", label: "R$ 1.500 a R$ 3.000/mês" },
    { value: "3000-5000", label: "R$ 3.000 a R$ 5.000/mês" },
    { value: "5000-", label: "Acima de R$ 5.000/mês" },
  ],
  temporada: [
    { value: "-200", label: "Até R$ 200/noite" },
    { value: "200-400", label: "R$ 200 a R$ 400/noite" },
    { value: "400-", label: "Acima de R$ 400/noite" },
  ],
};

export function HomeHero({ suggestions }: { suggestions: string[] }) {
  const router = useRouter();
  const [operation, setOperation] = useState<Operation>("");
  const [price, setPrice] = useState("");

  // Monta a URL só com o que foi preenchido. Sem JS, o form ainda funciona como GET normal.
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const params = new URLSearchParams();
    const q = String(data.get("q") ?? "").trim();
    const tipo = String(data.get("tipo") ?? "");
    if (q) params.set("q", q);
    if (operation) params.set("categoria", operation);
    if (tipo) params.set("tipo", tipo);
    if (price) {
      const [min, max] = price.split("-");
      if (min) params.set("precoMin", min);
      if (max) params.set("precoMax", max);
    }
    const query = params.toString();
    router.push(query ? `/imoveis?${query}` : "/imoveis");
  };

  return (
    <header className={styles.hero}>
      <div className={`${shared.wrap} ${styles.inner}`}>
        <h1 className={styles.title}>Encontre seu próximo imóvel. Fale direto com quem anuncia.</h1>
        <p className={styles.sub}>Casas e apartamentos para comprar, alugar ou ficar por temporada, em um só lugar.</p>

        <form action="/imoveis" method="GET" className={styles.search} onSubmit={handleSubmit} role="search">
          <fieldset className={styles.operations}>
            <legend className={styles.srOnly}>O que você procura?</legend>
            {OPERATIONS.map((item) => (
              <label key={item.label} className={styles.operation} data-active={operation === item.value}>
                <input
                  type="radio"
                  name="categoria"
                  value={item.value}
                  checked={operation === item.value}
                  onChange={() => {
                    setOperation(item.value);
                    setPrice("");
                  }}
                />
                {item.label}
              </label>
            ))}
          </fieldset>

          <div className={styles.fields}>
            <div className={`${styles.field} ${styles.fieldWhere}`}>
              <label htmlFor="home-q">Onde</label>
              <input
                id="home-q"
                name="q"
                type="text"
                placeholder="Cidade, bairro ou região"
                list={suggestions.length > 0 ? "home-locations" : undefined}
                autoComplete="off"
              />
              {suggestions.length > 0 && (
                <datalist id="home-locations">
                  {suggestions.map((item) => (
                    <option key={item} value={item} />
                  ))}
                </datalist>
              )}
            </div>

            <div className={styles.field}>
              <label htmlFor="home-tipo">Tipo de imóvel</label>
              <select id="home-tipo" name="tipo" defaultValue="">
                <option value="">Todos</option>
                <option value="apartamento">Apartamento</option>
                <option value="casa">Casa</option>
              </select>
            </div>

            <div className={styles.field}>
              <label htmlFor="home-preco">Faixa de preço</label>
              <select
                id="home-preco"
                value={price}
                onChange={(event) => setPrice(event.target.value)}
                disabled={!operation}
                aria-describedby={!operation ? "home-preco-hint" : undefined}
              >
                <option value="">Qualquer valor</option>
                {operation &&
                  PRICE_RANGES[operation].map((range) => (
                    <option key={range.value} value={range.value}>
                      {range.label}
                    </option>
                  ))}
              </select>
              {!operation && (
                <span id="home-preco-hint" className={styles.srOnly}>
                  Escolha comprar, alugar ou temporada para filtrar por preço.
                </span>
              )}
            </div>

            <button type="submit" className={styles.submit}>
              <Search size={18} aria-hidden="true" />
              <span>Buscar imóveis</span>
            </button>
          </div>
        </form>
      </div>
    </header>
  );
}
