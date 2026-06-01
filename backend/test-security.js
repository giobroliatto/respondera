#!/usr/bin/env node

/**
 * Script de teste direto para validação e sanitização
 * Não requer servidor rodando
 */

const { z } = require('zod');

// ─── Testes de Validação (Zod) ───────────────────────────────────────────────

console.log('\n=== TESTES DE VALIDAÇÃO (ZOD) ===\n');

// Schemas
const RegisterSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

const GenerateReplySchema = z.object({
  reviewText: z.string().max(2000, 'Review text must not exceed 2000 characters').optional(),
  rating: z.number().int('Rating must be an integer').min(1).max(5),
  reviewerName: z.string().optional(),
  tone: z.enum(['formal', 'friendly', 'empathetic']).optional(),
  detailRatings: z.record(z.string()).optional(),
  additionalContext: z.string().max(300, 'Additional context must not exceed 300 characters').nullable().optional(),
});

// Teste 1: Email válido
try {
  RegisterSchema.parse({ email: 'test@example.com', password: 'senha123' });
  console.log('✅ Teste 1 PASSOU: Email válido aceito');
} catch (err) {
  console.log('❌ Teste 1 FALHOU:', err.message);
}

// Teste 2: Email inválido
try {
  RegisterSchema.parse({ email: 'invalido', password: 'senha123' });
  console.log('❌ Teste 2 FALHOU: Email inválido não foi rejeitado');
} catch (err) {
  const errorMsg = err.issues?.[0]?.message || err.message;
  console.log('✅ Teste 2 PASSOU: Email inválido rejeitado -', errorMsg);
}

// Teste 3: Senha muito curta
try {
  RegisterSchema.parse({ email: 'test@example.com', password: '123' });
  console.log('❌ Teste 3 FALHOU: Senha curta não foi rejeitada');
} catch (err) {
  console.log('✅ Teste 3 PASSOU: Senha curta rejeitada -', err.errors[0].message);
}

// Teste 4: Rating fora do range (> 5)
try {
  GenerateReplySchema.parse({ reviewText: 'Bom', rating: 10, tone: 'friendly' });
  console.log('❌ Teste 4 FALHOU: Rating > 5 não foi rejeitado');
} catch (err) {
  console.log('✅ Teste 4 PASSOU: Rating fora do range rejeitado -', err.errors[0].message);
}

// Teste 5: Rating não é inteiro
try {
  GenerateReplySchema.parse({ reviewText: 'Bom', rating: 4.5, tone: 'friendly' });
  console.log('❌ Teste 5 FALHOU: Rating decimal não foi rejeitado');
} catch (err) {
  console.log('✅ Teste 5 PASSOU: Rating decimal rejeitado -', err.errors[0].message);
}

// Teste 6: reviewText muito grande (> 2000)
try {
  const longText = 'a'.repeat(2001);
  GenerateReplySchema.parse({ reviewText: longText, rating: 5, tone: 'friendly' });
  console.log('❌ Teste 6 FALHOU: reviewText > 2000 não foi rejeitado');
} catch (err) {
  console.log('✅ Teste 6 PASSOU: reviewText grande rejeitado -', err.errors[0].message);
}

// Teste 7: additionalContext muito grande (> 300)
try {
  const longContext = 'x'.repeat(301);
  GenerateReplySchema.parse({
    reviewText: 'Bom',
    rating: 5,
    tone: 'friendly',
    additionalContext: longContext,
  });
  console.log('❌ Teste 7 FALHOU: additionalContext > 300 não foi rejeitado');
} catch (err) {
  console.log('✅ Teste 7 PASSOU: additionalContext grande rejeitado -', err.errors[0].message);
}

// Teste 8: Tone inválido
try {
  GenerateReplySchema.parse({ reviewText: 'Bom', rating: 5, tone: 'agressivo' });
  console.log('❌ Teste 8 FALHOU: Tone inválido não foi rejeitado');
} catch (err) {
  console.log('✅ Teste 8 PASSOU: Tone inválido rejeitado -', err.errors[0].message);
}

// Teste 9: Valores válidos aceitos
try {
  GenerateReplySchema.parse({
    reviewText: 'Ótimo atendimento!',
    rating: 5,
    tone: 'friendly',
    reviewerName: 'João',
    additionalContext: 'Cliente habitual',
  });
  console.log('✅ Teste 9 PASSOU: Payload válido aceito');
} catch (err) {
  console.log('❌ Teste 9 FALHOU:', err.message);
}

// ─── Testes de Sanitização ───────────────────────────────────────────────────

console.log('\n=== TESTES DE SANITIZAÇÃO ===\n');

function stripHtml(text) {
  if (!text) return '';
  return text.replace(/<[^>]*>/g, '');
}

function sanitizeReviewText(text) {
  if (!text) return '';
  return stripHtml(text).trim().slice(0, 2000);
}

function sanitizeAdditionalContext(text) {
  if (!text) return null;
  const sanitized = stripHtml(text).trim().slice(0, 300);
  return sanitized || null;
}

// Teste 10: HTML em reviewText é removido
const reviewWithHtml = 'Ótimo <script>alert(1)</script> serviço';
const sanitizedReview = sanitizeReviewText(reviewWithHtml);
if (sanitizedReview === 'Ótimo alert(1) serviço') {
  console.log('✅ Teste 10 PASSOU: <script> tags removidas de reviewText');
  console.log(`   Original: "${reviewWithHtml}"`);
  console.log(`   Sanitizado: "${sanitizedReview}"`);
} else {
  console.log('❌ Teste 10 FALHOU: HTML não foi removido corretamente');
  console.log(`   Esperado: "Ótimo alert(1) serviço"`);
  console.log(`   Obtido: "${sanitizedReview}"`);
}

// Teste 11: HTML em additionalContext é removido
const contextWithHtml = 'Mencione <b>promoção</b>';
const sanitizedContext = sanitizeAdditionalContext(contextWithHtml);
if (sanitizedContext === 'Mencione promoção') {
  console.log('✅ Teste 11 PASSOU: <b> tags removidas de additionalContext');
  console.log(`   Original: "${contextWithHtml}"`);
  console.log(`   Sanitizado: "${sanitizedContext}"`);
} else {
  console.log('❌ Teste 11 FALHOU: HTML não foi removido corretamente');
}

// Teste 12: reviewText é truncado em 2000 chars
const longReview = 'a'.repeat(2500);
const truncatedReview = sanitizeReviewText(longReview);
if (truncatedReview.length === 2000) {
  console.log('✅ Teste 12 PASSOU: reviewText truncado em 2000 caracteres');
} else {
  console.log(`❌ Teste 12 FALHOU: Esperado 2000 chars, obteve ${truncatedReview.length}`);
}

// Teste 13: additionalContext é truncado em 300 chars
const longContext = 'x'.repeat(500);
const truncatedContext = sanitizeAdditionalContext(longContext);
if ((truncatedContext?.length || 0) === 300) {
  console.log('✅ Teste 13 PASSOU: additionalContext truncado em 300 caracteres');
} else {
  console.log(`❌ Teste 13 FALHOU: Esperado 300 chars, obteve ${truncatedContext?.length || 0}`);
}

// Teste 14: Múltiplas tags HTML removidas
const multipleHtml = 'Adorei <img src="x"/> o <iframe></iframe> atendimento <script>evil()</script>!';
const cleanMultiple = sanitizeReviewText(multipleHtml);
if (
  !cleanMultiple.includes('<') &&
  !cleanMultiple.includes('>') &&
  cleanMultiple.includes('Adorei') &&
  cleanMultiple.includes('atendimento')
) {
  console.log('✅ Teste 14 PASSOU: Múltiplas tags HTML removidas');
  console.log(`   Original: "${multipleHtml}"`);
  console.log(`   Sanitizado: "${cleanMultiple}"`);
} else {
  console.log('❌ Teste 14 FALHOU: Nem todas as tags foram removidas');
}

// ─── Resumo ───────────────────────────────────────────────────────────────────

console.log('\n=== RESUMO ===\n');
console.log('✅ = Teste passou');
console.log('❌ = Teste falhou');
console.log('\nTodos os testes de validação e sanitização foram executados.');
console.log('Se todos os testes passaram, a segurança está funcionando!\n');
