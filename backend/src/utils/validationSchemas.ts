import { z } from 'zod';

// ─── Auth ─────────────────────────────────────────────────────────────

export const RegisterSchema = z.object({
  email: z.string().email('Email inválido').toLowerCase().trim(),
  password: z.string().min(6, 'Senha deve ter no mínimo 6 caracteres'),
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
});

export type Business = z.infer<typeof BusinessSchema>;

// ─── Reply Generation ─────────────────────────────────────────────────

export const GenerateReplySchema = z.object({
  reviewText: z.string().max(2000, 'Texto da avaliação não pode exceder 2000 caracteres').optional().default(''),
  rating: z.number().int().min(1).max(5),
  reviewerName: z.string().max(200).optional(),
  tone: z.enum(['formal', 'friendly', 'empathetic', 'direct', 'casual', 'assertive', 'custom']).optional(),
  customTone: z.string().max(100).optional().nullable(),
  detailRatings: z.record(z.string(), z.string()).optional(),
  additionalContext: z.string().max(300, 'Contexto adicional não pode exceder 300 caracteres').nullable().optional(),
});

export type GenerateReply = z.infer<typeof GenerateReplySchema>;
