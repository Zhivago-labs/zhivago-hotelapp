// Local browser regression with API fixtures. Never reads or changes the configured database.
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
process.chdir(fileURLToPath(new URL('../../../', import.meta.url)));
import assert from 'node:assert/strict';
const artifacts = resolve('.tmp/workspace-browser');
await mkdir(artifacts, { recursive: true });
// Perfil do Edge limpo a cada execução: favoritos/cookies de uma rodada anterior quebram as asserções.
await rm(resolve(artifacts, 'edge-profile'), { recursive: true, force: true });
const base = 'http://localhost:3108';
const owner = { id: 'owner', name: 'Pessoa autenticada', avatar: null, email: 'owner@example.test', phone: null, accountType: 'INDIVIDUAL', companyName: null, createdAt: '2025-01-01T00:00:00Z', role: 'USER', status: 'ACTIVE', onboardingCompleted: true };
const member = { id: 'member-owner', userId: 'owner', role: 'OWNER', status: 'ACTIVE', user: owner, receiveLeads: true };
const organization = { id: 'org', name: 'Empresa de teste isolado', logo: null, description: 'Dados comerciais de teste', coverUrl: null, publicLocation: 'São Paulo', phone: null, email: null, legalName: null, address: null, businessHours: null, whatsapp: null, createdAt: owner.createdAt, document: '00000000000000', leadDistributionMode: 'MANUAL', hasSeason:true, members: [member] };
const listings = ['SALE','MONTHLY_RENT','DAILY_RENT'].map((operationType, index) => ({ id: `listing-${index}`, name: ['Casa venda','Apartamento mensal','Casa temporada'][index], operationType, category: index ? 'aluguel' : 'venda', price: [500000,2000,200][index], billingCycle: index === 2 ? 'noite' : 'mês', images: [], location: 'São Paulo', status: 'APPROVED', agentId: 'owner', agent: { id: 'owner', name: 'Pessoa autenticada' }, organizationId: 'org', viewCount: 20, _count: { conversations: 2, leads: 2 } }));
const lead = { id: 'lead-1', userId: 'customer', listingId: 'listing-0', organizationId: 'org', user: { id: 'customer', name: 'Cliente com dois interesses', email: 'customer@example.test' }, listing: { id: 'listing-0', name: 'Casa venda', images: [] }, status: 'NEW', source: 'CHAT', assignments: [], tasks: [], slaStatus: 'UNASSIGNED', createdAt: owner.createdAt };
const api = createServer((req,res) => {
  res.setHeader('Content-Type','application/json');
  res.setHeader('Access-Control-Allow-Origin',base);
  const url = new URL(req.url, 'http://localhost:4338');
  const identity = req.headers.authorization?.includes('broker') ? 'broker' : req.headers.authorization?.includes('common') ? 'common' : 'owner';
  const json = value => res.end(JSON.stringify(value));
  if (url.pathname === '/auth/me') return json({ ...owner, id: identity });
  if (url.pathname === '/organizations/me') {
    if (identity === 'common') { res.statusCode=404; return json({}); }
    return json({ role: identity === 'broker' ? 'BROKER' : 'OWNER', organization: { ...organization, members: [{ ...member, id: `member-${identity}`, userId: identity, role: identity === 'broker' ? 'BROKER' : 'OWNER', user: { ...owner, id: identity } }] } });
  }
  if (url.pathname === '/organizations/listings' || url.pathname === '/organizations/my-assigned-listings' || url.pathname === '/me/listings') return json(listings);
  if (url.pathname === '/organizations/buildings' || url.pathname === '/organizations/messages' || url.pathname === '/organizations/invites' || url.pathname === '/organizations/invites/me') return json([]);
  if (url.pathname === '/organizations/audit-log') return json({ items: [], total:0 });
  if (url.pathname === '/organizations/workspace') return json({ days:30, scope:'organization', newLeads:2, uniqueContacts:1, pendingCount:1, contactedRate:0.5, published:3, topListings:listings, topContactListings:listings, upcomingBookings:[], pending:[lead], visits:[], trend:{ '2026-11-06':2 }, hasSeason:true });
  if (url.pathname === '/organizations/contacts') return json({ total:1,page:1,limit:25,items:[{ id:'customer', name:lead.user.name,email:'customer@example.test',phone:null,leads:[{...lead, conversations:[]},{...lead,id:'lead-2',listing:{id:'listing-1',name:'Apartamento mensal'},conversations:[]}] }] });
  if (url.pathname === '/organizations/bookings') return json({ total:0,page:1,totalPages:1,bookings:[] });
  if (url.pathname === '/leads/workspace') return json({ items:[lead],total:150,allTotal:200,page:Number(url.searchParams.get('page') || 1),limit:100, summary:{ active:150,overdue:0,unassigned:150,byStatus:{NEW:150} } });
  if (url.pathname === '/users/owner') return json({ user:{...owner, accountType:'AGENCY'},organization, listings:[],reviews:[] });
  if (url.pathname === '/listings' || url.pathname.includes('favorites')) return json([]);
  if (url.pathname === '/users/me/stats') return json({statusCounts:{approved:0,pending:0,rejected:0},bookingsByMonth:{},revenueByMonth:{},propertyRatings:[],rentalRevenue:0,salesRevenue:0});
  if (url.pathname === '/users/me/received-bookings') return json({total:0,page:1,totalPages:1,bookings:[]});
  res.statusCode=404; json({});
});
await new Promise(resolve => api.listen(4338, resolve));
const next = spawn(process.execPath,['node_modules/next/dist/bin/next','dev','apps/web','-p','3108'],{ windowsHide:true, env:{...process.env,API_URL:'http://localhost:4338',NEXT_PUBLIC_API_URL:'http://localhost:4338'},stdio:['ignore','pipe','pipe'] });
let nextLog=''; next.stdout.on('data',data=>{nextLog+=data;}); next.stderr.on('data',data=>{nextLog+=data;});
const delay = ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function retry(fn, count=160){for(let i=0;i<count;i++){try{const result=await fn();if(result)return result;}catch{}await delay(250);}throw new Error('Timed out');}
let edge, ws;
try {
  await retry(async()=>(await fetch(`${base}/imoveis`)).ok);
  edge=spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',['--headless=new','--disable-extensions','--disable-gpu','--no-first-run','--remote-debugging-port=9228',`--user-data-dir=${resolve(artifacts,'edge-profile')}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
  const target=await retry(async()=>(await(await fetch('http://localhost:9228/json')).json()).find(item=>item.type==='page' && item.url==='about:blank'));
  ws=new WebSocket(target.webSocketDebuggerUrl);await once(ws,'open');let id=0;const pending=new Map();
  ws.addEventListener('message',({data})=>{const result=JSON.parse(data);if(pending.has(result.id)){const promise=pending.get(result.id);pending.delete(result.id);if(result.error) promise.reject(new Error(JSON.stringify(result.error))); else promise.resolve(result.result);}});
  const cdp=(method,params={})=>new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});ws.send(JSON.stringify({id:key,method,params}));});
  const evaluate=async expression=>{const result=await cdp('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw new Error(JSON.stringify(result.exceptionDetails));return result.result.value;};
  async function navigate(path, text){await cdp('Page.navigate',{url:base+path});await retry(()=>evaluate(`document.querySelector('main')?.innerText.includes(${JSON.stringify(text)})`));await delay(350);}
  async function screenshot(name){const{data}=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(resolve(artifacts,`${name}.png`),Buffer.from(data,'base64'));}
  await cdp('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await cdp('Network.setCookie',{name:'zhivago_token',value:'common',url:base});
  await navigate('/configuracoes','Configurações');
  assert.equal(await evaluate(`!!document.querySelector('[data-workspace]')`),false,'common user sidebar');
  await cdp('Network.setCookie',{name:'zhivago_token',value:'owner',url:base});
  await navigate('/empresa','Visão geral');
  assert.equal(await evaluate(`document.querySelector('#company-navigation strong').textContent`),organization.name);
  assert.ok(await evaluate(`document.querySelector('#company-navigation details').textContent.includes('Pessoa autenticada')`));
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('[data-public-header]')).display`),'none');
  assert.equal(await evaluate(`document.querySelector('nav[aria-label="Área da imobiliária"] a[aria-current]').getAttribute('href')`),'/empresa');
  await screenshot('overview-desktop');
  await navigate('/empresa/contatos','Contatos');
  assert.equal(await evaluate(`document.querySelectorAll('tbody tr').length`),1);
  assert.equal(await evaluate(`document.querySelectorAll('a[href^="/imobiliaria/leads/"]').length`),2);
  await navigate('/empresa/imoveis','Imóveis');
  assert.equal(await evaluate(`document.querySelectorAll('tbody tr').length`),3);
  assert.ok(await evaluate(`document.querySelector('tbody').textContent.includes('/ mês') && document.querySelector('tbody').textContent.includes('/ noite')`));
  await screenshot('properties-desktop');
  await navigate('/imobiliaria?page=2','Kanban');
  assert.equal(await evaluate(`document.querySelector('[data-status="NEW"] [class*="columnCount"]').textContent`),'150');
  assert.ok(await evaluate(`document.querySelector('main').textContent.includes('todos os resultados filtrados')`));
  await screenshot('kanban-desktop');
  await navigate('/configuracoes/imobiliaria','Minha imobiliária');
  assert.equal(await evaluate(`document.querySelector('#showcase-name').value`),organization.name);
  assert.ok(await evaluate(`!!document.querySelector('#legalName') && !!document.querySelector('#businessHours')`));
  await navigate('/configuracoes','Configurações');
  assert.equal(await evaluate(`document.querySelector('input[name="companyName"]')===null`),true);
  await navigate('/empresa/mensagens','Mensagens'); await navigate('/empresa/reservas','Reservas');
  await navigate('/imoveis','Explorar imóveis');
  assert.equal(await evaluate(`!!document.querySelector('[data-workspace]')`),false,'public site must remain public');
  await cdp('Network.setCookie',{name:'zhivago_token',value:'broker',url:base});
  await navigate('/empresa','Visão geral');
  assert.equal(await evaluate(`!!document.querySelector('#company-navigation a[href="/configuracoes/imobiliaria"]')`),false);
  await cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await navigate('/empresa/imoveis','Imóveis');
  assert.ok(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'));
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('tbody tr')).display`),'grid');
  await screenshot('properties-mobile');
  await evaluate(`document.querySelector('button[aria-controls="company-navigation"]').click()`);await delay(100);
  assert.equal(await evaluate(`document.querySelector('button[aria-controls="company-navigation"]').getAttribute('aria-expanded')`),'true');
  assert.ok(await evaluate(`document.activeElement.closest('#company-navigation')!==null`));
  await screenshot('navigation-mobile');
  await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});await delay(100);
  assert.equal(await evaluate(`document.querySelector('button[aria-controls="company-navigation"]').getAttribute('aria-expanded')`),'false');
  console.log('PASS: common user without sidebar, company vs personal identity, active navigation, contacts with multiple opportunities, compact inventory and price units, full Kanban totals on page 2, separate settings, messages/reservations routes, public return, broker menu, mobile cards, menu and Escape.');
} catch(error){await writeFile(resolve(artifacts,'next.log'),nextLog);throw error;}
finally{ws?.close();edge?.kill();next.kill();api.close();}
