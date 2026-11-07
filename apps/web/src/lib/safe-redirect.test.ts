import assert from 'node:assert/strict';
import test from 'node:test';
import { safeRedirectTarget } from './safe-redirect';

test('keeps internal destinations with search and fragment', () => {
  for (const target of ['/anuncios/novo', '/imoveis?q=Ipatinga#lista', '/equipe?convite=abc', '/boas-vindas?next=%2Fanuncios%2Fnovo']) assert.equal(safeRedirectTarget(target, '/imoveis'), target);
});
test('rejects external, protocol-relative, backslash, encoded separator and control redirects', () => {
  for (const target of [null, '', 'https://evil.invalid', '//evil.invalid', '/\\evil.invalid', '/%5cevil.invalid', '/%2f/evil.invalid', '/\nevil.invalid', '/..//evil.invalid']) assert.equal(safeRedirectTarget(target, '/imoveis'), '/imoveis');
});
