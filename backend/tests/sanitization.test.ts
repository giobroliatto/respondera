import { describe, expect, it } from 'vitest';
import {
  sanitizeAdditionalContext,
  sanitizeEmail,
  sanitizeReviewText,
  sanitizeText,
  stripHtml,
} from '../src/utils/sanitization';

describe('stripHtml', () => {
  it('remove tags e mantém o texto', () => {
    expect(stripHtml('Mencione a <b>promoção</b> de hoje')).toBe('Mencione a promoção de hoje');
  });

  it('remove scripts inteiros, inclusive o conteúdo', () => {
    expect(stripHtml('Ótimo <script>alert(1)</script>serviço')).toBe('Ótimo serviço');
  });

  it('neutraliza vetores com atributos de evento', () => {
    expect(stripHtml('<img src=x onerror="alert(1)">Comida boa')).toBe('Comida boa');
  });
});

describe('sanitizeReviewText', () => {
  it('retorna string vazia para avaliação sem texto', () => {
    expect(sanitizeReviewText(undefined)).toBe('');
    expect(sanitizeReviewText('')).toBe('');
  });

  it('limita o texto a 2000 caracteres', () => {
    expect(sanitizeReviewText('a'.repeat(2500))).toHaveLength(2000);
  });
});

describe('sanitizeText', () => {
  it('respeita o limite informado', () => {
    expect(sanitizeText('a'.repeat(2000), 1500)).toHaveLength(1500);
  });

  it('usa 500 caracteres como limite padrão', () => {
    expect(sanitizeText('a'.repeat(800))).toHaveLength(500);
  });
});

describe('sanitizeAdditionalContext', () => {
  it('limita o contexto a 300 caracteres', () => {
    expect(sanitizeAdditionalContext('a'.repeat(500))).toHaveLength(300);
  });

  it('retorna null quando não sobra texto depois da limpeza', () => {
    expect(sanitizeAdditionalContext(null)).toBeNull();
    expect(sanitizeAdditionalContext('<b></b>   ')).toBeNull();
  });
});

describe('sanitizeEmail', () => {
  it('normaliza caixa e espaços', () => {
    expect(sanitizeEmail('  Contato@Exemplo.com ')).toBe('contato@exemplo.com');
  });
});
