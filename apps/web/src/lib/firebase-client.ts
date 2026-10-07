"use client";

import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";

// Config pública do app web no Firebase (Console → Configurações do projeto → Seus apps).
// Esses valores não são segredos — vão no bundle do navegador de qualquer jeito e a validação real
// acontece no backend (POST /auth/firebase). Os defaults são o projeto de produção "zhivago-4a123",
// pra não depender de env var no build da Netlify; as NEXT_PUBLIC_FIREBASE_* sobrescrevem se definidas.
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "AIzaSyCnbUjNzunfZDz0NoiG5caEAebuJlejh0Y",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "zhivago-4a123.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "zhivago-4a123",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "1:1027900158419:web:28c978e56d4210b2cfbf26",
};

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId
);

function getFirebaseApp(): FirebaseApp {
  return getApps()[0] ?? initializeApp(firebaseConfig);
}

/**
 * Abre o popup do Google e devolve o ID token do Firebase. A sessão do Firebase no navegador é
 * descartada logo em seguida: quem mantém a sessão do Zhivago é o cookie httpOnly com o JWT do backend.
 */
export async function getGoogleIdToken(): Promise<string> {
  const auth = getAuth(getFirebaseApp());
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });

  const credential = await signInWithPopup(auth, provider);
  const idToken = await credential.user.getIdToken();
  await signOut(auth).catch(() => undefined);
  return idToken;
}
