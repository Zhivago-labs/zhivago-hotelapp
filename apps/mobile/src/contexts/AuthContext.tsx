import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';


// ─── TIPOS ────────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: 'USER' | 'ADMIN';
  avatar?: string | null;
  accountType?: 'INDIVIDUAL' | 'AGENCY';
  companyName?: string | null;
  creci?: string | null;
  verified?: boolean;
}

export interface RegisterOptions {
  name: string;
  email: string;
  password: string;
  accountType: 'INDIVIDUAL' | 'AGENCY';
  companyName?: string;
  document?: string;
  creci?: string;
}

interface AuthContextData {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (options: RegisterOptions) => Promise<void>;
  logout: () => Promise<void>;
  updateSessionUser: (data: Partial<AuthUser>) => Promise<void>;
}

// ─── CONTEXTO ─────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextData>({} as AuthContextData);

import { API_URL } from '@/config/api';
const TOKEN_KEY = '@zhivago:token';
const USER_KEY = '@zhivago:user';

// ─── PROVIDER ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  /**
   * ─── PERSISTÊNCIA DE SESSÃO COM ASYNCSTORAGE ──────────────────────────────────────
   * No ambiente mobile (React Native), não dispomos de "cookies" ou "localStorage" síncrono.
   * Usamos o AsyncStorage, que realiza leituras e escritas assíncronas no armazenamento
   * nativo do dispositivo (SQLite, iOS Keychain ou Android Shared Preferences).
   * 
   * A função `restoreSession` roda imediatamente na montagem do Provider para verificar
   * se há tokens salvos de acessos anteriores e restaurar o estado global de autenticação.
   */
  useEffect(() => {
    const restoreSession = async () => {
      try {
        // Carrega o token e dados cadastrais salvos de forma concorrente
        const [savedToken, savedUser] = await Promise.all([
          AsyncStorage.getItem(TOKEN_KEY),
          AsyncStorage.getItem(USER_KEY),
        ]);
        if (savedToken && savedUser) {
          setToken(savedToken);
          setUser(JSON.parse(savedUser) as AuthUser);
        }
      } catch {
        // Ignora erros de leitura de hardware
      } finally {
        /**
         * O ESTADO `isLoading` E A PREVENÇÃO DE REDIRECIONAMENTOS INCORRETOS:
         * Enquanto a leitura assíncrona do AsyncStorage não termina, `isLoading` é mantido 
         * como `true`. O arquivo de rotas principal do app (`_layout.tsx`) bloqueia a 
         * renderização das telas e exibe um Splash Screen/Loading indicator.
         * Se essa barreira de carregamento não existisse, o app iria renderizar e redirecionar 
         * o usuário para a tela de Login por uma fração de segundo antes de ler o token 
         * e decidir que ele estava logado, causando uma experiência visual ruim ("flash de tela").
         */
        setIsLoading(false);
      }
    };
    restoreSession();
  }, []);

  // ─── LOGIN ──────────────────────────────────────────────────────────────────

  const login = async (email: string, password: string) => {
    const response = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json() as { user: AuthUser; token: string; error?: string };

    if (!response.ok) {
      throw new Error(data.error ?? 'Erro ao fazer login.');
    }

    setUser(data.user);
    setToken(data.token);
    await AsyncStorage.setItem(TOKEN_KEY, data.token);
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(data.user));
  };

  // ─── REGISTER ───────────────────────────────────────────────────────────────

  const register = async (options: RegisterOptions) => {
    const response = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options),
    });

    const data = await response.json() as { user: AuthUser; token: string; error?: string };

    if (!response.ok) {
      throw new Error(
        Array.isArray(data.error)
          ? (data.error as Array<{ message: string }>)[0]?.message ?? 'Erro ao cadastrar.'
          : (data.error ?? 'Erro ao cadastrar.')
      );
    }

    setUser(data.user);
    setToken(data.token);
    await AsyncStorage.setItem(TOKEN_KEY, data.token);
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(data.user));
  };

  // ─── LOGOUT ─────────────────────────────────────────────────────────────────

  const logout = async () => {
    setUser(null);
    setToken(null);
    await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
  };

  // ─── UPDATE SESSION ───────────────────────────────────────────────────────────

  const updateSessionUser = async (data: Partial<AuthUser>) => {
    if (!user) return;
    const updatedUser = { ...user, ...data };
    setUser(updatedUser);
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(updatedUser));
  };

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, register, logout, updateSessionUser }}>
      {children}
    </AuthContext.Provider>
  );
}

// ─── HOOK ─────────────────────────────────────────────────────────────────────

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth deve ser usado dentro de AuthProvider');
  return context;
}
