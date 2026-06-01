// types.ts — tipos compartilhados entre todos os módulos da extensão

// ─── Planos ───────────────────────────────────────────────────────────────────

export type Plan = 'FREE' | 'PRO';
export type ToneOption = 'friendly' | 'formal' | 'empathetic';
export type PanelState = 'idle' | 'loading' | 'success' | 'error' | 'limit_reached' | 'not_logged_in';

// ─── Avaliação ────────────────────────────────────────────────────────────────

export interface ReviewData {
  text: string | null;
  rating: number | null;
  reviewerName: string | null;
  hasExistingReply: boolean;
  tone?: ToneOption;
  detailRatings?: Record<string, string>; // ex: { "Comida": "5", "Serviço": "4", "Ambiente": "5", "Preço por pessoa": "R$40-60" }
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  email: string;
  plan: Plan;
  usageCount: number;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

// ─── Business ─────────────────────────────────────────────────────────────────

export interface BusinessData {
  name: string;
  segment: string;
  tone: string;
  avgTicket?: string | null;
  highlights?: string | null;
}

export interface BusinessResponse extends BusinessData {
  id: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Resposta gerada ──────────────────────────────────────────────────────────

export interface GenerateReplyData {
  reviewText: string;
  rating: number;
  reviewerName?: string;
  tone?: ToneOption;
  detailRatings?: Record<string, string>;
}

export interface GenerateReplyResponse {
  reply: string;
  tokensUsed: number;
  remainingUsage: number;
  contextWarning?: string;
}

// ─── Erros tipados ────────────────────────────────────────────────────────────

export type ApiErrorCode =
  | 'SESSION_EXPIRED'
  | 'USAGE_LIMIT_REACHED'
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'UNKNOWN';

export class ApiError extends Error {
  constructor(
    public readonly code: ApiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// ─── Mensagens entre scripts ──────────────────────────────────────────────────

export interface GenerateReplyMessage {
  type: 'GENERATE_REPLY';
  data: ReviewData;
}

export interface LoggedInMessage {
  type: 'RESPONDERA_LOGGED_IN';
}

export type ExtensionMessage = GenerateReplyMessage | LoggedInMessage;
