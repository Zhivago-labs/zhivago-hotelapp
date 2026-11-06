import assert from 'node:assert/strict';
import Fastify from 'fastify';
import jwt from '@fastify/jwt';
import { prisma } from '../src/lib/prisma.js';
import { usersRoutes } from '../src/routes/users.routes.js';

// Isolated authorization regression: never connects to the configured database.
const app = Fastify();
await app.register(jwt, { secret: 'showcase-test-secret-only' });
let membership: any = null;
let accountType = 'AGENCY';
let writes: any[] = [];
(prisma.user.findUnique as any) = async () => ({ id: 'viewer', email: 'test@example.test', role: 'USER', status: 'ACTIVE', tokenVersion: 0, accountType });
(prisma.organizationMember.findUnique as any) = async () => membership;
(prisma.organization.update as any) = async (args: any) => { writes.push(args); return {}; };
(prisma.user.update as any) = async (args: any) => { writes.push(args); return {}; };
await app.register(usersRoutes);
const payload = { name: 'Empresa teste', logo: null, coverUrl: null, description: null, publicLocation: null, phone: null, email: null };
const token = app.jwt.sign({ id: 'viewer', tokenVersion: 0 });
async function patch(body: any = payload, authenticated = true) {
  return app.inject({ method: 'PATCH', url: '/users/me/showcase', payload: body, headers: authenticated ? { authorization: `Bearer ${token}` } : {} });
}
try {
  assert.equal((await patch(payload, false)).statusCode, 401);
  for (const role of ['BROKER', 'MANAGER', 'ASSISTANT']) {
    membership = { organizationId: 'org-own', role, status: 'ACTIVE' };
    assert.equal((await patch()).statusCode, 403, role);
  }
  membership = { organizationId: 'org-own', role: 'OWNER', status: 'INACTIVE' };
  assert.equal((await patch()).statusCode, 403);
  assert.equal(writes.length, 0);
  for (const role of ['OWNER', 'ADMIN']) {
    membership = { organizationId: 'org-own', role, status: 'ACTIVE' };
    assert.equal((await patch()).statusCode, 200);
    assert.deepEqual(writes.at(-1).where, { id: 'org-own' });
  }
  assert.equal((await patch({ ...payload, organizationId: 'other-org' })).statusCode, 400);
  assert.equal((await patch({ ...payload, coverUrl: 'javascript:alert(1)' })).statusCode, 400);
  assert.equal((await patch({ ...payload, email: 'invalid' })).statusCode, 400);
  membership = null; accountType = 'INDIVIDUAL';
  assert.equal((await patch()).statusCode, 403);
  accountType = 'AGENCY';
  assert.equal((await patch()).statusCode, 200);
  assert.deepEqual(writes.at(-1).where, { id: 'viewer' });
  assert.equal(writes.at(-1).data.publicPhone, null);
  assert.equal('phone' in writes.at(-1).data, false, 'personal phone must remain unchanged');
  console.log('PASS: anonymous, inactive members, broker/manager/assistant, owner/admin, tenant isolation, invalid fields, individual/agency, public phone removal.');
} finally {
  await app.close(); await prisma.$disconnect();
}
