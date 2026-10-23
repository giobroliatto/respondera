import { describe, expect, it } from 'vitest';
import { BusinessSchema, GenerateReplySchema, RegisterSchema } from '../src/utils/validationSchemas';

describe('RegisterSchema', () => {
  it('normaliza o e-mail', () => {
    const data = RegisterSchema.parse({ email: 'Dono@Pizzaria.com', password: 'senha-forte' });
    expect(data.email).toBe('dono@pizzaria.com');
  });

  it('rejeita e-mail inválido e senha curta', () => {
    expect(RegisterSchema.safeParse({ email: 'invalido', password: 'senha-forte' }).success).toBe(false);
    expect(RegisterSchema.safeParse({ email: 'a@b.com', password: '1234567' }).success).toBe(false);
  });
});

describe('GenerateReplySchema', () => {
  it('aplica os valores padrão', () => {
    const data = GenerateReplySchema.parse({ rating: 5 });
    expect(data.reviewText).toBe('');
    expect(data.mode).toBe('generate');
  });

  it.each([0, 6, 4.5])('rejeita nota %s', (rating) => {
    expect(GenerateReplySchema.safeParse({ rating }).success).toBe(false);
  });

  it('rejeita tom desconhecido', () => {
    expect(GenerateReplySchema.safeParse({ rating: 3, tone: 'agressivo' }).success).toBe(false);
  });

  it('respeita os limites de tamanho dos campos de texto', () => {
    expect(GenerateReplySchema.safeParse({ rating: 3, reviewText: 'a'.repeat(2001) }).success).toBe(false);
    expect(GenerateReplySchema.safeParse({ rating: 3, additionalContext: 'a'.repeat(301) }).success).toBe(false);
    expect(GenerateReplySchema.safeParse({ rating: 3, customTone: 'a'.repeat(201) }).success).toBe(false);
    expect(GenerateReplySchema.safeParse({ rating: 3, draftText: 'a'.repeat(1501) }).success).toBe(false);
  });
});

describe('BusinessSchema', () => {
  it('exige nome e segmento', () => {
    expect(BusinessSchema.safeParse({ name: '', segment: 'Pizzaria' }).success).toBe(false);
    expect(BusinessSchema.safeParse({ name: 'Dom Carlo', segment: '' }).success).toBe(false);
  });

  it('aceita só M ou F como gênero do profissional autônomo', () => {
    const base = { name: 'Ana Psicóloga', segment: 'Psicologia', soloOperator: true };
    expect(BusinessSchema.safeParse({ ...base, soloGender: 'F' }).success).toBe(true);
    expect(BusinessSchema.safeParse({ ...base, soloGender: 'X' }).success).toBe(false);
  });
});
