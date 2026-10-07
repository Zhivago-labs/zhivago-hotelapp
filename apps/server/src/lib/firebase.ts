import { initializeApp, getApps, type App } from 'firebase-admin/app';
import { getAuth, type DecodedIdToken } from 'firebase-admin/auth';
import { FIREBASE_PROJECT_ID } from './env.js';

// Só verificamos ID tokens emitidos pelo Firebase Auth (login com Google no site). Para isso o
// Admin SDK precisa apenas do projectId — as chaves públicas do Google são buscadas e cacheadas
// pelo próprio SDK, então não há service account/segredo para guardar no servidor.
let app: App | null = null;

function getFirebaseApp(): App | null {
  if (!FIREBASE_PROJECT_ID) return null;
  if (!app) {
    app = getApps()[0] ?? initializeApp({ projectId: FIREBASE_PROJECT_ID });
  }
  return app;
}

export function isFirebaseEnabled(): boolean {
  return !!FIREBASE_PROJECT_ID;
}

/** Valida o ID token do Firebase; lança se for inválido, expirado ou de outro projeto. */
export async function verifyFirebaseIdToken(idToken: string): Promise<DecodedIdToken> {
  const firebaseApp = getFirebaseApp();
  if (!firebaseApp) throw new Error('Firebase não configurado.');
  return getAuth(firebaseApp).verifyIdToken(idToken);
}
