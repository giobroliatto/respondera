/**
 * Funções de sanitização para remover HTML e limpar dados de usuário
 */

/**
 * Remove tags HTML de uma string
 */
export function stripHtml(text: string): string {
  return text.replace(/<[^>]*>/g, '').trim();
}

/**
 * Sanitiza reviewText: remove HTML, trim, limita a 2000 caracteres
 */
export function sanitizeReviewText(text: string | undefined): string {
  if (!text) return '';
  return stripHtml(text).slice(0, 2000).trim();
}

/**
 * Sanitiza campo de texto genérico: remove HTML, trim, limita a N caracteres
 */
export function sanitizeText(text: string | undefined, maxLength: number = 500): string {
  if (!text) return '';
  return stripHtml(text).slice(0, maxLength).trim();
}

/**
 * Sanitiza contexto adicional: remove HTML, trim, limita a 300
 */
export function sanitizeAdditionalContext(text: string | undefined | null): string | null {
  if (!text) return null;
  const sanitized = stripHtml(text).slice(0, 300).trim();
  return sanitized || null;
}

/**
 * Valida e sanitiza email
 */
export function sanitizeEmail(email: string): string {
  return email.toLowerCase().trim().slice(0, 254); // RFC 5321
}
