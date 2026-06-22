import { z } from 'zod';

// ─── Auth ─────────────────────────────────────────────────────────────

export const RegisterSchema = z.object({
  email: z.string().email('Email inválido').toLowerCase().trim(),
  password: z.string().min(8, 'Senha deve ter no mínimo 8 caracteres'),
});

export const LoginSchema = z.object({
  email: z.string().email('Email inválido').toLowerCase().trim(),
  password: z.string().min(1, 'Senha é obrigatória'),
});

export type Register = z.infer<typeof RegisterSchema>;
export type Login = z.infer<typeof LoginSchema>;

// ─── Business ─────────────────────────────────────────────────────────

export const BusinessSchema = z.object({
  name: z.string().min(1, 'Nome do estabelecimento é obrigatório').max(200),
  segment: z.string().min(1, 'Segmento é obrigatório').max(100),
  tone: z.enum(['formal', 'friendly', 'empathetic', 'direct', 'casual', 'assertive', 'custom']).optional(),
  avgTicket: z.string().max(100).nullable().optional(),
  highlights: z.string().max(500).nullable().optional(),
  soloOperator: z.boolean().optional(),
  soloGender: z.enum(['M', 'F']).nullable().optional(),
  defaultCustomToneId: z.string().max(64).nullable().optional(),
});

export type Business = z.infer<typeof BusinessSchema>;

// ─── Custom Tones ──────────────────────────────────────────────────────────────

export const CustomToneCreateSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório').max(30, 'Nome pode ter no máximo 30 caracteres').trim(),
  description: z.string().min(1, 'Descrição é obrigatória').max(200, 'Descrição pode ter no máximo 200 caracteres').trim(),
});

export const CustomToneUpdateSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório').max(30, 'Nome pode ter no máximo 30 caracteres').trim(),
  description: z.string().min(1, 'Descrição é obrigatória').max(200, 'Descrição pode ter no máximo 200 caracteres').trim(),
});

export type CustomToneCreate = z.infer<typeof CustomToneCreateSchema>;
export type CustomToneUpdate = z.infer<typeof CustomToneUpdateSchema>;

// ─── Reply Generation ─────────────────────────────────────────────────

export const GenerateReplySchema = z.object({
  reviewText: z.string().max(2000, 'Texto da avaliação não pode exceder 2000 caracteres').optional().default(''),
  rating: z.number().int().min(1).max(5),
  reviewerName: z.string().max(200).optional(),
  tone: z.enum(['formal', 'friendly', 'empathetic', 'direct', 'casual', 'assertive', 'custom']).optional(),
  customTone: z.string().max(200, 'O tom personalizado não pode exceder 200 caracteres').optional().nullable(),
  detailRatings: z.record(z.string(), z.string()).optional(),
  additionalContext: z.string().max(300, 'Contexto adicional não pode exceder 300 caracteres').nullable().optional(),
  mode: z.enum(['generate', 'improve']).optional().default('generate'),
  draftText: z.string().max(1500, 'O rascunho não pode exceder 1500 caracteres').nullable().optional(),
});

export type GenerateReply = z.infer<typeof GenerateReplySchema>;
