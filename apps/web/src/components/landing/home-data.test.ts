import assert from 'node:assert/strict';
import test from 'node:test';
import type { Listing } from '@zhivago/shared';
import { citySummaries, locationSuggestions, eligiblePublicListings } from './home-data';

test('public cities, suggestions and counts exclude explicit demos and unpublished listings', () => {
  const listing = (overrides: Partial<Listing>) => ({ id: 'real', status: 'APPROVED', isDemo: false, cidade: 'Cidade A', uf: 'MG', location: 'Cidade A, MG', ...overrides }) as Listing;
  const records = [listing({}), listing({ id: 'same-city' }), listing({ id: 'demo', isDemo: true, cidade: 'Exemplo' }), listing({ id: 'draft', status: 'DRAFT', cidade: 'Rascunho' }), listing({ id: 'other-state', uf: 'SP' })];
  assert.equal(eligiblePublicListings(records).length, 3);
  assert.deepEqual(citySummaries(records).map(city => [city.label, city.count]), [['Cidade A - MG', 2], ['Cidade A - SP', 1]]);
  assert.deepEqual(locationSuggestions(records), ['Cidade A']);
  assert.deepEqual(citySummaries([]), []);
});
