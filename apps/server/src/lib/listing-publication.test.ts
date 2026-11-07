import assert from 'node:assert/strict';
import test from 'node:test';
import { publicationIssues, omitOtherModalities } from './listing-publication.js';

const sale = { name: 'Imóvel', price: 100000, location: 'Cidade, MG', type: 'casa', category: 'venda', operationType: 'SALE', bedrooms: 0, bathrooms: 0, parking: 0 };

test('publication rejects incomplete records, zero/negative/invalid prices and missing photos', () => {
  assert(publicationIssues({}, 0).length >= 5);
  for (const price of [0, -1, NaN, Infinity]) assert(publicationIssues({ ...sale, price }, 1).some(message => message.includes('preço')));
  assert(publicationIssues(sale, 0).some(message => message.includes('foto')));
  assert.equal(publicationIssues(sale, 1).length, 0);
  assert(publicationIssues(sale, 11).length > 0);
});

test('rental capacity and safety need explicit values; false is distinct from unknown', () => {
  const daily = { ...sale, operationType: 'DAILY_RENT', category: 'aluguel', customMaxGuests: 2, minimumNights: 1 };
  assert(publicationIssues(daily, 1).some(message => message.includes('segurança')));
  const safetyItems = JSON.stringify({ externalCameras: false, smokeAlarm: false, fireExtinguisher: false, doorman24h: false, firstAidKit: false });
  assert.deepEqual(publicationIssues({ ...daily, safetyItems }, 1), []);
  assert(publicationIssues({ ...daily, safetyItems, customMaxGuests: 0 }, 1).length > 0);
});

test('physical counts and charges reject negative or fractional counts', () => {
  assert(publicationIssues({ ...sale, parking: -1 }, 1).length > 0);
  assert(publicationIssues({ ...sale, bedrooms: 1.5 }, 1).length > 0);
  assert(publicationIssues({ ...sale, condoFee: -1 }, 1).length > 0);
});

test('each modality strips incompatible incoming fields and keeps shared data', () => {
  for (const operation of ['SALE', 'MONTHLY_RENT', 'DAILY_RENT']) {
    const data: Record<string, unknown> = { name: 'Imóvel', price: 100, condoFee: 10, checkInTime: '15:00', houseRules: '{}', iptuAnnual: 20, iptuMonthly: 2, guaranteeTypes: '[]' };
    omitOtherModalities(data, operation);
    assert.equal(data.name, 'Imóvel'); assert.equal(data.price, 100);
    assert.equal('houseRules' in data, operation === 'DAILY_RENT');
    assert.equal('iptuAnnual' in data, operation === 'SALE');
    assert.equal('iptuMonthly' in data, operation === 'MONTHLY_RENT');
    assert.equal('condoFee' in data, operation !== 'DAILY_RENT');
  }
});
