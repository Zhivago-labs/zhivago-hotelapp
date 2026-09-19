/**
 * Base URL da API acessível a partir do navegador (Client Components).
 * `getApiUrl()` em `lib/api.ts` lê `API_URL`, uma env var só de servidor — o socket.io-client
 * e qualquer fetch feito no browser precisam da variante `NEXT_PUBLIC_*`, inlined no bundle.
 */
export function getPublicApiUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3333";
}
