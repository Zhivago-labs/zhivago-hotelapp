import assert from 'node:assert/strict';
import Fastify from 'fastify';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prisma } from '../src/lib/prisma.js';
import { usersRoutes } from '../src/routes/users.routes.js';

// Isolated authorization regression: never connects to the configured database.
const app = Fastify();
await app.register(jwt, { secret: 'showcase-test-secret-only' });
await app.register(multipart, { limits: { fileSize: 20 * 1024 * 1024 } });
// Sem GCS_BUCKET_NAME o upload grava em apps/server/uploads (mesmo destino do dev local); o teste apaga o que criou.
const uploadsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'uploads');
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
  // ── Upload de logo/capa ──
  const png = await sharp({ create: { width: 900, height: 300, channels: 3, background: '#ff385c' } }).png().toBuffer();
  async function upload(kind: string, file: Buffer, mime = 'image/png', authenticated = true) {
    const boundary = '----showcase-test';
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="x.png"\r\nContent-Type: ${mime}\r\n\r\n`),
      file,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    return app.inject({ method: 'POST', url: `/users/me/showcase/image?kind=${kind}`, payload: body, headers: {
      'content-type': `multipart/form-data; boundary=${boundary}`, ...(authenticated ? { authorization: `Bearer ${token}` } : {}),
    } });
  }
  assert.equal((await upload('cover', png, 'image/png', false)).statusCode, 401);
  membership = { organizationId: 'org-own', role: 'BROKER', status: 'ACTIVE' };
  assert.equal((await upload('cover', png)).statusCode, 403, 'broker cannot upload');
  membership = { organizationId: 'org-own', role: 'OWNER', status: 'ACTIVE' };
  assert.equal((await upload('banner', png)).statusCode, 400, 'unknown kind');
  assert.equal((await upload('logo', Buffer.from('not an image'), 'text/plain')).statusCode, 400, 'non-image mime');
  assert.equal((await upload('logo', Buffer.from('not an image'))).statusCode, 400, 'corrupt image');
  const writesBefore = writes.length;
  for (const kind of ['logo', 'cover'] as const) {
    const res = await upload(kind, png);
    assert.equal(res.statusCode, 200, `${kind} upload`);
    const { url } = res.json() as { url: string };
    assert.match(url, new RegExp(`/uploads/showcase-${kind}-org-own-\\d+\\.webp$`));
    const saved = path.join(uploadsDir, path.basename(url));
    const meta = await sharp(await fs.readFile(saved)).metadata();
    assert.equal(meta.format, 'webp');
    if (kind === 'logo') assert.deepEqual([meta.width, meta.height], [400, 400]);
    else assert.equal(meta.width, 900, 'cover keeps size when smaller than 1600');
    await fs.unlink(saved);
  }
  assert.equal(writes.length, writesBefore, 'upload must not write to the showcase before Save');

  console.log('PASS: anonymous, inactive members, broker/manager/assistant, owner/admin, tenant isolation, invalid fields, individual/agency, public phone removal, image upload (auth, role, kind, non-image, resize, no DB write).');
} finally {
  await app.close(); await prisma.$disconnect();
}
