type CatalogRegion = { bairro: string | null; cidade: string | null; uf: string | null };

/** Only the detail and management routes publish the full address. Free text has unknown precision. */
export function catalogListing<T extends CatalogRegion>(listing: T) {
  const city = [listing.cidade?.trim(), listing.uf?.trim()].filter(Boolean).join(' - ');
  const location = [listing.bairro?.trim(), city].filter(Boolean).join(', ') || 'Região não informada';
  return { ...listing, location, cep: null, logradouro: null, numero: null, complemento: null };
}
