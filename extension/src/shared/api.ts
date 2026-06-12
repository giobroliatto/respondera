// api.ts — camada de comunicação com o backend
// Lê o token de chrome.storage.local automaticamente.
// Erros são sempre instâncias de ApiError com código tipado.

import { getStorage, clearStorage } from './storage';
import {
  ApiError,
  AuthResponse,
  BusinessData,
  BusinessResponse,
  GenerateReplyData,
  GenerateReplyResponse,
  SavedTone,
} from './types';

// ─── Configuração ─────────────────────────────────────────────────────────────

const TIMEOUT_MS = 15_000;

// BACKEND_URL é injetado pelo webpack DefinePlugin
declare const BACKEND_URL: string;

// ─── Cache simples em memória ─────────────────────────────────────────────────
// Evita chamadas repetidas a /business dentro da mesma sessão do service worker.
// Invalidado ao salvar novo contexto.

let businessCache: BusinessResponse | null = null;

// ─── Utilitário de fetch com timeout e tratamento centralizado ────────────────

async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  requiresAuth = true,
): Promise<T> {
  const controller = new AbortController();
  const timerId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };

  if (requiresAuth) {
    const token = await getStorage('authToken');
    if (!token) {
      throw new ApiError('SESSION_EXPIRED', 'Você precisa fazer login.');
    }
    headers['Authorization'] = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(`${BACKEND_URL}${path}`, {
      ...options,
      headers,
      signal: controller.signal,
    });
  } catch (err: unknown) {
    clearTimeout(timerId);
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ApiError('TIMEOUT', 'Tempo esgotado. Verifique sua conexão e tente novamente.');
    }
    throw new ApiError(
      'NETWORK_ERROR',
      `Erro de rede ao chamar ${BACKEND_URL}${path}. Verifique se o backend está rodando e recarregue a extensão.`,
    );
  } finally {
    clearTimeout(timerId);
  }

  // 401 — sessão expirada: limpa storage e emite evento (apenas para rotas autenticadas)
  if (res.status === 401 && requiresAuth) {
    await clearStorage();
    chrome.runtime.sendMessage({ type: 'SESSION_EXPIRED' }).catch(() => {
      // Ignora se não há listener (popup fechado)
    });
    throw new ApiError('SESSION_EXPIRED', 'Sessão expirada. Faça login novamente.');
  }

  // 403 — pode ser limite de uso ou tom PRO
  if (res.status === 403) {
    const body = await res.json().catch(() => ({})) as { error?: string; message?: string };
    if (body.error === 'USAGE_LIMIT_REACHED') {
      throw new ApiError('USAGE_LIMIT_REACHED', 'Você atingiu o limite de respostas deste mês.');
    }
    if (body.error === 'EMAIL_NOT_VERIFIED') {
      throw new ApiError('EMAIL_NOT_VERIFIED', body.message ?? 'Confirme seu e-mail antes de gerar respostas.');
    }
    if (body.error === 'PRO_REQUIRED') {
      throw new ApiError('UNKNOWN', body.message ?? 'Este tom está disponível apenas no plano PRO.');
    }
    throw new ApiError('UNKNOWN', 'Acesso negado.');
  }

  // 404 — recurso não encontrado (não é erro fatal para alguns endpoints)
  if (res.status === 404) {
    throw new ApiError('UNKNOWN', '__NOT_FOUND__');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string; message?: string };
    const msg = body.message ?? body.error ?? `Erro ${res.status}.`;
    throw new ApiError('UNKNOWN', msg);
  }

  return res.json() as Promise<T>;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export async function login(email: string, password: string): Promise<AuthResponse> {
  return apiFetch<AuthResponse>(
    '/auth/login',
    { method: 'POST', body: JSON.stringify({ email, password }) },
    false,
  );
}

export async function register(email: string, password: string): Promise<AuthResponse> {
  return apiFetch<AuthResponse>(
    '/auth/register',
    { method: 'POST', body: JSON.stringify({ email, password }) },
    false,
  );
}

export async function getMe(): Promise<AuthResponse['user']> {
  return apiFetch<AuthResponse['user']>('/auth/me', { method: 'GET' });
}

export async function resendVerificationEmail(): Promise<{ message: string; emailVerified: boolean }> {
  return apiFetch<{ message: string; emailVerified: boolean }>(
    '/auth/resend-verification',
    { method: 'POST', body: JSON.stringify({}) },
  );
}

export async function logout(): Promise<void> {
  // Fire-and-forget — se falhar (token já expirado etc.) não impede o logout local
  await apiFetch('/auth/logout', { method: 'POST' }).catch(() => {});
}

// ─── Business ─────────────────────────────────────────────────────────────────

export async function getBusiness(): Promise<BusinessResponse | null> {
  if (businessCache) return businessCache;

  try {
    const data = await apiFetch<{ business: BusinessResponse }>('/business', { method: 'GET' });
    businessCache = data.business;
    return businessCache;
  } catch (err) {
    if (err instanceof ApiError && err.message === '__NOT_FOUND__') return null;
    throw err;
  }
}

export async function saveBusiness(data: BusinessData): Promise<BusinessResponse> {
  businessCache = null; // invalida cache
  const result = await apiFetch<{ business: BusinessResponse }>(
    '/business',
    { method: 'POST', body: JSON.stringify(data) },
  );
  businessCache = result.business;
  return businessCache;
}

// ─── Geração de resposta ──────────────────────────────────────────────────────

export async function generateReply(data: GenerateReplyData): Promise<GenerateReplyResponse> {
  return apiFetch<GenerateReplyResponse>(
    '/reply/generate',
    { method: 'POST', body: JSON.stringify(data) },
  );
}

// ─── Custom Tones ─────────────────────────────────────────────────────────────

let customTonesCache: SavedTone[] | null = null;

// Returns backend tones and updates cache+sync, or null if unreachable.
export async function getCustomTonesFromBackend(): Promise<SavedTone[] | null> {
  try {
    const data = await apiFetch<{ tones: SavedTone[] }>('/custom-tones', { method: 'GET' });
    customTonesCache = data.tones;
    chrome.storage.sync.set({ savedCustomTones: customTonesCache });
    return customTonesCache;
  } catch {
    return null;
  }
}

export async function getCustomTones(): Promise<SavedTone[]> {
  if (customTonesCache) return customTonesCache;

  const backendTones = await getCustomTonesFromBackend();
  if (backendTones !== null) return backendTones;

  // Offline fallback: read from chrome.storage.sync
  return new Promise((resolve) => {
    chrome.storage.sync.get('savedCustomTones', (result) => {
      resolve((result['savedCustomTones'] as SavedTone[]) ?? []);
    });
  });
}

export async function createCustomTone(name: string, description: string): Promise<SavedTone> {
  const data = await apiFetch<{ tone: SavedTone }>(
    '/custom-tones',
    { method: 'POST', body: JSON.stringify({ name, description }) },
  );
  if (customTonesCache !== null) {
    customTonesCache = [...customTonesCache, data.tone];
    chrome.storage.sync.set({ savedCustomTones: customTonesCache });
  }
  return data.tone;
}

export async function updateCustomTone(id: string, name: string, description: string): Promise<SavedTone> {
  const data = await apiFetch<{ tone: SavedTone }>(
    `/custom-tones/${id}`,
    { method: 'PUT', body: JSON.stringify({ name, description }) },
  );
  if (customTonesCache !== null) {
    customTonesCache = customTonesCache.map((t) => t.id === id ? data.tone : t);
    chrome.storage.sync.set({ savedCustomTones: customTonesCache });
  }
  return data.tone;
}

export async function deleteCustomTone(id: string): Promise<void> {
  await apiFetch<{ success: boolean }>(`/custom-tones/${id}`, { method: 'DELETE' });
  if (customTonesCache !== null) {
    customTonesCache = customTonesCache.filter((t) => t.id !== id);
    chrome.storage.sync.set({ savedCustomTones: customTonesCache });
  }
}

// ─── Pagamentos ───────────────────────────────────────────────────────────────

export async function createSubscription(): Promise<{ checkoutUrl: string }> {
  return apiFetch<{ checkoutUrl: string }>(
    '/payments/create-subscription',
    { method: 'POST', body: JSON.stringify({}) },
  );
}
