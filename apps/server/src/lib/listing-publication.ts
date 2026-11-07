type CandidateFields = {
  name?: string; price?: number; location?: string; type?: string; category?: string;
  bedrooms?: number; bathrooms?: number; parking?: number; suites?: number;
  operationType?: string; customMaxGuests?: number | null; minimumNights?: number | null;
  privateArea?: number | null; totalArea?: number | null; cleaningFee?: number | null;
  condoFee?: number | null; iptuAnnual?: number | null; iptuMonthly?: number | null;
  safetyItems?: string | null;
};
type Candidate = { [K in keyof CandidateFields]?: CandidateFields[K] | undefined };

/** Also used when publishing a saved draft: checks the resulting record, not only the patch. */
export function publicationIssues(data: Candidate, imageCount: number): string[] {
  const issues: string[] = [];
  if (!data.name?.trim()) issues.push('Informe o título do imóvel.');
  if (!(typeof data.price === 'number' && Number.isFinite(data.price) && data.price > 0)) issues.push('Informe um preço maior que zero.');
  if (!data.location?.trim()) issues.push('Informe a localização do imóvel.');
  if (!['casa', 'apartamento'].includes(data.type ?? '')) issues.push('Selecione um tipo de imóvel válido.');
  if (!['venda', 'aluguel'].includes(data.category ?? '')) issues.push('Selecione uma modalidade válida.');
  for (const key of ['bedrooms', 'bathrooms', 'parking', 'suites'] as const) {
    if (data[key] !== undefined && (!Number.isInteger(data[key]) || data[key]! < 0)) issues.push('As quantidades de cômodos e vagas devem ser inteiros não negativos.');
  }
  for (const key of ['privateArea', 'totalArea', 'cleaningFee', 'condoFee', 'iptuAnnual', 'iptuMonthly'] as const) {
    if (data[key] != null && (!Number.isFinite(data[key]) || data[key]! < 0)) issues.push('Áreas e encargos devem ser números não negativos.');
  }
  if (data.operationType === 'DAILY_RENT') {
    if (!Number.isInteger(data.customMaxGuests) || data.customMaxGuests! < 1) issues.push('Informe a capacidade de hóspedes.');
    if (!Number.isInteger(data.minimumNights) || data.minimumNights! < 1) issues.push('Informe a estadia mínima em noites.');
    let safety: Record<string, unknown> = {};
    try { safety = JSON.parse(data.safetyItems ?? '{}') ?? {}; } catch { /* report below */ }
    if (['externalCameras', 'smokeAlarm', 'fireExtinguisher', 'doorman24h', 'firstAidKit'].some(key => typeof safety[key] !== 'boolean')) issues.push('Informe se o imóvel possui cada item de segurança.');
  }
  if (imageCount < 1) issues.push('Adicione ao menos uma foto.');
  if (imageCount > 10) issues.push('Envie no máximo 10 fotos.');
  return issues;
}

/** Mutates only incoming data; shared fields and client-side choices are preserved. */
export function omitOtherModalities(data: Record<string, unknown>, operation: string): void {
  const exclusive = {
    DAILY_RENT: ['checkInTime', 'checkOutTime', 'customMaxGuests', 'minimumNights', 'cleaningFee', 'houseRules', 'safetyItems', 'cancellationPolicy'],
    SALE: ['iptuAnnual', 'acceptsFinancing', 'acceptsExchange'],
    MONTHLY_RENT: ['iptuMonthly', 'availableFrom', 'minimumLeaseMonths', 'guaranteeTypes', 'allowPets'],
  };
  for (const [mode, keys] of Object.entries(exclusive)) if (mode !== operation) for (const key of keys) delete data[key];
  if (operation === 'DAILY_RENT') delete data.condoFee;
}
