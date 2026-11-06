// Dependency-free browser regression using installed Edge and isolated API fixtures.
// Run: node apps/web/tests/showcase-browser.mjs (requires Microsoft Edge on Windows).
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
const artifacts = resolve('.tmp/showcase-browser');
await mkdir(artifacts, { recursive: true });
const base = 'http://localhost:3107';
const owner = { id: 'owner', name: 'Responsável de teste', avatar: null };
const profile = {
  user: { ...owner, accountType: 'AGENCY', companyName: 'Imobiliária de teste', createdAt: '2025-01-01T00:00:00Z', phone: null, publicPhone: null, publicEmail: null, logoUrl: null, coverUrl: null, publicDescription: null, publicLocation: null, creci: null, verified: false },
  organization: { id: 'org', name: 'Imobiliária de teste', logo: null, coverUrl: null, description: 'Descrição usada somente no teste isolado.', publicLocation: 'São Paulo, SP', phone: '11999990000', email: null, verified: false, createdAt: '2025-01-01T00:00:00Z', members: [{ role: 'OWNER', user: owner }, { role: 'BROKER', user: { id: 'broker', name: 'Corretor de teste', avatar: null } }] },
  reviews: [],
  listings: ['SALE', 'MONTHLY_RENT', 'DAILY_RENT'].map((operationType, i) => ({ id: `listing-${i}`, name: ['Casa de venda', 'Apartamento mensal', 'Casa de temporada'][i], operationType, category: i ? 'aluguel' : 'venda', type: i === 1 ? 'apartamento' : 'casa', location: ['Centro, Santos', 'Pinheiros, São Paulo', 'Praia, Guarujá'][i], cidade: ['Santos', 'São Paulo', 'Guarujá'][i], bairro: ['Centro', 'Pinheiros', 'Praia'][i], uf: 'SP', price: [500000, 2500, 300][i], billingCycle: i === 2 ? 'noite' : 'mês', images: [{ id: 'photo-1', url: 'http://localhost:4337/fixture.svg', order: 0 }, { id: 'photo-2', url: 'http://localhost:4337/fixture.svg?second', order: 1 }], bedrooms: 2, bathrooms: 1, parking: 1, viewCount: 3 - i, createdAt: '2025-01-01T00:00:00Z', organizationId: 'org', organization: { id: 'org', name: 'Imobiliária de teste', verified: false }, status: 'APPROVED', amenities: null })),
};
const showcaseWrites = [];
const api = createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', base);
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  if (req.method === 'POST' && req.url?.startsWith('/users/me/showcase/image')) {
    for await (const _ of req); // consome o multipart
    const kind = new URL(req.url, 'http://x').searchParams.get('kind');
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ url: `http://localhost:4337/fixture.svg?uploaded-${kind}` }));
  }
  if (req.method === 'PATCH' && req.url === '/users/me/showcase') {
    let body = ''; for await (const chunk of req) body += chunk;
    showcaseWrites.push({ auth: req.headers.authorization, body: JSON.parse(body) });
    res.setHeader('Content-Type', 'application/json');
    return res.end('{"success":true}');
  }
  if (req.url?.startsWith('/fixture.svg')) {
    res.setHeader('Content-Type', 'image/svg+xml');
    return res.end('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" fill="#e2e8f0"/><text x="40" y="200" font-size="24">Imagem de teste isolado</text></svg>');
  }
  res.setHeader('Content-Type', 'application/json');
  if (req.url === '/users/owner') return res.end(JSON.stringify(profile));
  if (req.url === '/users/broker') return res.end(JSON.stringify({ ...profile, user: { ...profile.user, id: 'broker', name: 'Corretor de teste' } }));
  if (req.url === '/auth/me') {
    const id = req.headers.authorization?.includes('broker') ? 'broker' : 'owner';
    return res.end(JSON.stringify({ ...profile.user, id, email: `${id}@example.test`, status: 'ACTIVE', role: 'USER', onboardingCompleted: true }));
  }
  if (req.url?.includes('favorites')) return res.end('[]');
  res.statusCode = 404; res.end('{}');
});
await new Promise(resolve => api.listen(4337, resolve));
const next = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', 'apps/web', '-p', '3107'], { windowsHide: true, env: { ...process.env, API_URL: 'http://localhost:4337', NEXT_PUBLIC_API_URL: 'http://localhost:4337' }, stdio: ['ignore', 'pipe', 'pipe'] });
let nextLog = '';
next.stdout.on('data', data => { nextLog += data; });
next.stderr.on('data', data => { nextLog += data; });
let edge, ws;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function retry(fn, count = 100) { for (let i = 0; i < count; i++) { try { const r = await fn(); if (r) return r; } catch {} await delay(250); } throw new Error('Timed out waiting for browser/server'); }
try {
  await retry(async () => (await fetch(`${base}/imobiliaria/owner`)).ok);
  edge = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=9227', `--user-data-dir=${resolve(artifacts, 'edge-profile')}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  const target = await retry(async () => (await (await fetch('http://localhost:9227/json')).json()).find(t => t.type === 'page'));
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await once(ws, 'open');
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', ({ data }) => { const msg = JSON.parse(data); if (msg.id && pending.has(msg.id)) { const { resolve, reject } = pending.get(msg.id); pending.delete(msg.id); msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result); } });
  const cdp = (method, params = {}) => new Promise((resolve, reject) => { const key = ++id; pending.set(key, { resolve, reject }); ws.send(JSON.stringify({ id: key, method, params })); });
  const evaluate = async expression => { const result = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails)); return result.result.value; };
  const click = text => evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === ${JSON.stringify(text)})?.click()`);
  const titles = () => evaluate(`[...document.querySelectorAll('#showcase-section h3')].map(e => e.textContent)`);
  async function navigate() { await cdp('Page.navigate', { url: `${base}/imobiliaria/owner` }); await retry(() => evaluate(`!!document.querySelector('#showcase-section input')`)); await delay(700); }
  async function screenshot(name) { const { data } = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); await writeFile(resolve(artifacts, `${name}.png`), Buffer.from(data, 'base64')); }
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await navigate();
  assert.equal((await titles()).length, 3);
  assert.equal(await evaluate(`!!document.querySelector('a[href="/configuracoes/imobiliaria"]')`), false);
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('[class*="showcaseGrid"]')).gridTemplateColumns.split(' ').length`), 3);
  assert.ok(await evaluate(`document.querySelector('a[href^="https://wa.me/"]').href.includes('5511999990000')`));
  await screenshot('desktop');
  assert.ok(await evaluate(`!!document.querySelector('a[href="/imovel/listing-0"]')`));
  await evaluate(`document.querySelector('button[aria-label="Salvar nos favoritos"]').click()`);
  await delay(100);
  assert.ok(await evaluate(`!!document.querySelector('button[aria-label="Remover dos favoritos"]')`));
  await evaluate(`document.querySelector('button[aria-label="Ver todas as fotos"]').click()`);
  await retry(() => evaluate(`!!document.querySelector('[role="dialog"][aria-label^="Galeria"]')`));
  await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' });
  await delay(100);
  await click('Mais filtros'); await delay(150);
  assert.ok(await evaluate(`!!document.activeElement.closest('[role="dialog"]')`));
  await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' });
  await delay(100);
  assert.equal(await evaluate(`document.querySelector('[aria-label="Filtros avançados"]') === null`), true);
  for (const [filter, expected] of [['Comprar', 'Casa de venda'], ['Alugar', 'Apartamento mensal'], ['Temporada', 'Casa de temporada']]) {
    await click(filter); await delay(200); assert.deepEqual(await titles(), [expected]);
  }
  await click('Todos'); await delay(150);
  await evaluate(`(() => { const input = document.querySelector('#showcase-section input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'Pinheiros'); input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await delay(200); assert.deepEqual(await titles(), ['Apartamento mensal']);
  await click('Equipe'); await delay(150); assert.ok(await evaluate(`document.querySelector('#showcase-section').textContent.includes('Corretor de teste')`));
  await click('Sobre'); await delay(150); assert.ok(await evaluate(`document.querySelector('#showcase-section').textContent.includes('Descrição usada somente no teste')`));
  await evaluate(`Object.defineProperty(navigator, 'share', { configurable: true, value: undefined }); Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async value => { window.__copied = value; } } });`);
  await click('Compartilhar'); await delay(150); assert.equal(await evaluate('window.__copied'), `${base}/imobiliaria/owner`);
  await cdp('Network.setCookie', { name: 'zhivago_token', value: 'owner', url: base }); await navigate();
  assert.equal(await evaluate(`!!document.querySelector('a[href="/configuracoes/imobiliaria"]')`), true);
  await cdp('Network.setCookie', { name: 'zhivago_token', value: 'broker', url: base }); await navigate();
  assert.equal(await evaluate(`!!document.querySelector('a[href="/configuracoes/imobiliaria"]')`), false);
  for (const [width, columns, name] of [[800, 2, 'tablet'], [390, 1, 'mobile']]) {
    await cdp('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: width < 600 }); await delay(200);
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('[class*="showcaseGrid"]')).gridTemplateColumns.split(' ').length`), columns);
    assert.ok(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'), 'horizontal overflow');
    await screenshot(name);
  }
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('[class*="mobileContact"]')).position`), 'fixed');
  // ── Edição da imobiliária: atalhos, envio de capa/logo e permissão ──
  const visit = async (path, ready) => { await cdp('Page.navigate', { url: `${base}${path}` }); await retry(() => evaluate(ready)); await delay(500); };
  const fixturePng = resolve(artifacts, 'upload.png');
  await writeFile(fixturePng, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
  async function chooseFile(selector) {
    const { root } = await cdp('DOM.getDocument', { depth: -1 });
    const { nodeId } = await cdp('DOM.querySelector', { nodeId: root.nodeId, selector });
    await cdp('DOM.setFileInputFiles', { nodeId, files: [fixturePng] });
  }
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  // Broker: sem atalho nas configurações e página de edição explica que não pode.
  await visit('/configuracoes', `document.body.innerText.includes('Configurações da Conta')`);
  assert.equal(await evaluate(`!!document.querySelector('a[href="/configuracoes/imobiliaria"]')`), false, 'broker sees no showcase card');
  await visit('/configuracoes/imobiliaria', `document.body.innerText.includes('Minha imobiliária')`);
  assert.ok(await evaluate(`document.body.innerText.includes('Só o proprietário ou um administrador')`));
  assert.equal(await evaluate(`!!document.querySelector('form input[type=file]')`), false);
  // Owner: atalho nas configurações leva ao formulário.
  await cdp('Network.setCookie', { name: 'zhivago_token', value: 'owner', url: base });
  await visit('/configuracoes', `!!document.querySelector('a[href="/configuracoes/imobiliaria"]')`);
  await evaluate(`document.querySelector('a[href="/configuracoes/imobiliaria"]').click()`);
  await retry(() => evaluate(`!!document.querySelector('#showcase-name')`));
  await delay(500);
  assert.equal(await evaluate(`document.querySelector('#showcase-name').value`), 'Imobiliária de teste');
  assert.equal(await evaluate(`document.querySelector('#showcase-location').value`), 'São Paulo, SP');
  const inputs = `form input[type=file]`;
  await chooseFile(`${inputs}:nth-of-type(2)`); // capa (2º input de arquivo)
  await retry(() => evaluate(`document.querySelector('img[alt="Prévia da capa"]')?.src.includes('uploaded-cover')`));
  await chooseFile(`${inputs}:nth-of-type(1)`); // logo
  await retry(() => evaluate(`document.querySelector('img[alt="Prévia do logo"]')?.src.includes('uploaded-logo')`));
  assert.ok(await evaluate(`document.body.innerText.includes('Há alterações não salvas')`));
  assert.equal(showcaseWrites.length, 0, 'upload alone must not save');
  await screenshot('settings-before-save');
  await click('Salvar alterações');
  await retry(() => evaluate(`document.body.innerText.includes('Imobiliária atualizada')`));
  assert.equal(showcaseWrites.length, 1);
  assert.equal(showcaseWrites[0].body.coverUrl, 'http://localhost:4337/fixture.svg?uploaded-cover');
  assert.equal(showcaseWrites[0].body.logo, 'http://localhost:4337/fixture.svg?uploaded-logo');
  assert.equal(showcaseWrites[0].body.publicLocation, 'São Paulo, SP');
  // Remover a capa e salvar manda null.
  await evaluate(`document.querySelector('button[aria-label="Remover capa"]').click()`);
  await delay(100);
  await click('Salvar alterações');
  await retry(() => showcaseWrites.length === 2);
  assert.equal(showcaseWrites[1].body.coverUrl, null);
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }); await delay(300);
  assert.ok(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'), 'settings horizontal overflow');
  await screenshot('settings-mobile');

  await cdp('Page.navigate', { url: `${base}/imobiliaria/missing` }); await retry(() => evaluate(`document.body.innerText.includes('Perfil não encontrado')`));
  console.log('PASS: desktop/tablet/mobile columns, no horizontal overflow, sale/rent/season filters, neighborhood search, tabs, contact URL, clipboard sharing, owner/broker/anonymous edit visibility, 404. Screenshots: .tmp/showcase-browser');
} catch (error) {
  await writeFile(resolve(artifacts, 'next.log'), nextLog);
  throw error;
} finally {
  ws?.close(); edge?.kill(); next.kill(); api.close();
}
