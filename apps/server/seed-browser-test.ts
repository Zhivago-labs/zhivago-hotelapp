import { prisma } from './src/lib/prisma.js';

const API = 'http://localhost:3333';
const TEST_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
);
const suffix = Date.now();

async function register(opts: { name: string; email: string; document?: string }) {
  const res = await fetch(`${API}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: opts.name,
      email: opts.email,
      password: 'senha123',
      accountType: opts.document ? 'AGENCY' : 'INDIVIDUAL',
      document: opts.document,
    }),
  });
  const data = await res.json();
  if (res.status !== 201) throw new Error(`register failed: ${JSON.stringify(data)}`);
  return { token: data.token as string, user: data.user as { id: string; email: string } };
}

async function createOrgListing(token: string, name: string) {
  const fd = new FormData();
  fd.append('name', name);
  fd.append('price', '350000');
  fd.append('type', 'apartamento');
  fd.append('category', 'venda');
  fd.append('location', 'Ipatinga, MG');
  fd.append('bedrooms', '3');
  fd.append('bathrooms', '2');
  fd.append('parking', '2');
  fd.append('images', new Blob([TEST_PNG], { type: 'image/png' }), 'test.png');
  const res = await fetch(`${API}/listings`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
  return res.json();
}

async function main() {
  const owner = await register({ name: 'Browser Owner', email: `browser-owner-${suffix}@test.com`, document: `${suffix}0001` });
  const orgRes = await fetch(`${API}/organizations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${owner.token}` },
    body: JSON.stringify({ name: `Browser Imobiliária ${suffix}`, document: `${suffix}0002` }),
  });
  const org = await orgRes.json();

  const broker = await register({ name: 'Browser Broker', email: `browser-broker-${suffix}@test.com` });
  const assistant = await register({ name: 'Browser Assistant', email: `browser-assistant-${suffix}@test.com` });

  for (const [token, email, role] of [
    [broker.token, broker.user.email, 'BROKER'],
    [assistant.token, assistant.user.email, 'ASSISTANT'],
  ] as const) {
    await fetch(`${API}/organizations/invites`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${owner.token}` },
      body: JSON.stringify({ email, role }),
    });
    const myInvitesRes = await fetch(`${API}/organizations/invites/me`, { headers: { Authorization: `Bearer ${token}` } });
    const myInvites = await myInvitesRes.json();
    await fetch(`${API}/organizations/invites/${myInvites[0].token}/accept`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  const listing = await createOrgListing(owner.token, `Cobertura Browser ${suffix}`);
  await prisma.listing.update({ where: { id: listing.id }, data: { status: 'APPROVED' } });
  await prisma.organization.update({ where: { id: org.id }, data: { verified: true } });

  const buyer = await register({ name: 'Browser Buyer', email: `browser-buyer-${suffix}@test.com` });
  await fetch(`${API}/conversations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${buyer.token}` },
    body: JSON.stringify({ listingId: listing.id }),
  });

  console.log(JSON.stringify({
    ownerEmail: owner.user.email,
    brokerEmail: broker.user.email,
    assistantEmail: assistant.user.email,
    buyerEmail: buyer.user.email,
    password: 'senha123',
    listingId: listing.id,
    ownerId: owner.user.id,
  }, null, 2));

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
