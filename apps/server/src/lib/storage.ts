import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Storage } from '@google-cloud/storage';
import { BASE_URL } from './env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const bucketName = process.env['GCS_BUCKET_NAME'];
const localUploadsDir = path.join(__dirname, '..', '..', 'uploads');

// Sem GCS_BUCKET_NAME (dev local) os uploads vão pro disco, servidos pelo /uploads/ estático do
// Fastify (ver server.ts). Com a var definida (produção, Cloud Run) vão pro bucket do GCS — o
// Cloud Run tem filesystem efêmero, então gravar em disco lá se perde a cada reinício.
const storage = bucketName ? new Storage() : null;

if (!storage) {
  console.warn(
    '⚠️  GCS_BUCKET_NAME não definido — uploads vão para o disco local (uploads/). Não use isso em produção no Cloud Run.'
  );
}

export async function saveUpload(buffer: Buffer, filename: string, contentType: string): Promise<string> {
  if (storage && bucketName) {
    await storage.bucket(bucketName).file(filename).save(buffer, { contentType, resumable: false });
    return `https://storage.googleapis.com/${bucketName}/${filename}`;
  }

  await fs.writeFile(path.join(localUploadsDir, filename), buffer);
  return `${BASE_URL}/uploads/${filename}`;
}
