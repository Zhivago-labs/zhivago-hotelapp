const isProduction = process.env['NODE_ENV'] === 'production';

const rawJwtSecret = process.env['JWT_SECRET'];

if (!rawJwtSecret && isProduction) {
  throw new Error('JWT_SECRET must be set in production — refusing to start with an insecure fallback.');
}

if (!rawJwtSecret) {
  console.warn('⚠️  JWT_SECRET não definido — usando um valor de desenvolvimento inseguro. Defina JWT_SECRET no .env.');
}

export const JWT_SECRET = rawJwtSecret ?? 'insecure_dev_only_fallback_do_not_use_in_production';

// Origens do site Next.js permitidas no CORS (Fastify + Socket.io). O app mobile não envia
// header Origin (não é um navegador), então não é afetado por essa restrição.
export const ALLOWED_ORIGINS = (process.env['WEB_URL'] ?? 'http://localhost:3000')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

// URL do site Next.js usada para montar links absolutos em e-mails (convite de organização,
// etc.) — primeira origem permitida, mesma fonte que o CORS já usa.
export const WEB_URL = ALLOWED_ORIGINS[0] ?? 'http://localhost:3000';

// URL base da aplicação — usada para construir URLs de imagens e links de forma segura,
// sem depender do header Host da requisição (que pode ser manipulado pelo cliente).
export const BASE_URL = process.env['BASE_URL'] ?? 'http://localhost:3333';

// Web Push (VAPID)
const vapidPublicKey = process.env['VAPID_PUBLIC_KEY'];
const vapidPrivateKey = process.env['VAPID_PRIVATE_KEY'];
export const VAPID_SUBJECT = process.env['VAPID_SUBJECT'] ?? 'mailto:contato@zhivago.com';
export const VAPID_KEYS =
  vapidPublicKey && vapidPrivateKey ? { publicKey: vapidPublicKey, privateKey: vapidPrivateKey } : null;

if (!VAPID_KEYS) {
  console.warn('⚠️  VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY não definidos — Web Push para o site fica desativado.');
}
