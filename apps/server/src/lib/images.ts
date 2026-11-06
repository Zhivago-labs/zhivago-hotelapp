import sharp from 'sharp';
import { saveUpload } from './storage.js';

// Cada foto de anúncio vira duas: a principal (galeria/página do imóvel) e a miniatura
// `<nome>.thumb.webp` (cards da exploração). A miniatura não fica no banco — o web deriva a URL
// pela convenção (ver apps/web/src/lib/images.ts) e cai pra principal se ela não existir.
const MAIN_WIDTH = 1200;
const MAIN_QUALITY = 80;
const THUMB_WIDTH = 480;
const THUMB_QUALITY = 70;

export class InvalidImageError extends Error {}

export function thumbnailFilename(filename: string): string {
  return filename.replace(/\.webp$/, '.thumb.webp');
}

export async function makeThumbnail(input: Buffer): Promise<Buffer> {
  return sharp(input)
    .rotate()
    .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
    .webp({ quality: THUMB_QUALITY })
    .toBuffer();
}

/** Grava principal + miniatura e devolve a URL da principal (a que vai pro banco). */
export async function saveListingPhoto(input: Buffer, filename: string): Promise<string> {
  let main: Buffer;
  try {
    // rotate() sem argumento aplica a orientação EXIF — foto de celular deitada fica em pé.
    main = await sharp(input)
      .rotate()
      .resize({ width: MAIN_WIDTH, withoutEnlargement: true })
      .webp({ quality: MAIN_QUALITY })
      .toBuffer();
  } catch {
    throw new InvalidImageError('Um dos arquivos enviados não é uma imagem válida.');
  }

  const thumb = await makeThumbnail(main);
  const [url] = await Promise.all([
    saveUpload(main, filename, 'image/webp'),
    saveUpload(thumb, thumbnailFilename(filename), 'image/webp'),
  ]);
  return url;
}
