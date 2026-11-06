// Gera a miniatura `<nome>.thumb.webp` das fotos que já estavam na pasta uploads/ antes de o upload
// passar a criá-las (ver lib/images.ts). Não altera nem renomeia nenhum arquivo existente — as URLs
// gravadas no banco continuam valendo. Idempotente: pula fotos que já têm miniatura.
// Na VPS: `docker compose exec api node dist/scripts/generate-thumbnails.js`
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeThumbnail, thumbnailFilename } from '../lib/images.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, '..', '..', 'uploads');
const HEAVY_BYTES = 200 * 1024;

async function main() {
  const files = await fs.readdir(uploadsDir);
  const existing = new Set(files);
  // Avatar já é 400x400 — não precisa de miniatura.
  const photos = files.filter((f) => f.endsWith('.webp') && !f.endsWith('.thumb.webp') && !f.startsWith('avatar-'));

  let created = 0;
  let failed = 0;
  const heavy: string[] = [];

  for (const file of photos) {
    const source = path.join(uploadsDir, file);
    const { size } = await fs.stat(source);
    if (size > HEAVY_BYTES) heavy.push(`${file} (${Math.round(size / 1024)} KB)`);

    const thumbName = thumbnailFilename(file);
    if (existing.has(thumbName)) continue;

    try {
      const thumb = await makeThumbnail(await fs.readFile(source));
      await fs.writeFile(path.join(uploadsDir, thumbName), thumb);
      created++;
    } catch (error) {
      failed++;
      console.error(`Falhou: ${file}`, error);
    }
  }

  console.log(`${photos.length} fotos; ${created} miniaturas criadas; ${failed} falhas.`);
  if (heavy.length > 0) {
    console.log(`Fotos acima de 200 KB (só informativo):\n  ${heavy.join('\n  ')}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
