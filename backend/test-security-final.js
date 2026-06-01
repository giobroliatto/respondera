#!/usr/bin/env node
const { z } = require('zod');

console.log('\n=== TESTES DE SEGURANÇA - VALIDAÇÃO E SANITIZAÇÃO ===\n');

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

let passCount = 0;
let failCount = 0;

function testPass(name) {
  console.log(`✅ ${name}`);
  passCount++;
}

function testFail(name, error) {
  console.log(`❌ ${name}: ${error}`);
  failCount++;
}

// ─── TESTES DE VALIDAÇÃO ───────────────────────────────────────────────────

console.log('--- VALIDAÇÃO (ZOD) ---\n');

// Teste 1
try {
  RegisterSchema.parse({ email: 'test@example.com', password: 'senha123' });
  testPass('Teste 1: Email válido aceito');
} catch (e) {
  testFail('Teste 1', e.issues[0]?.message);
}

// Teste 2
try {
  RegisterSchema.parse({ email: 'invalido', password: 'senha123' });
  testFail('Teste 2: Email inválido não foi rejeitado', '');
} catch (e) {
  testPass('Teste 2: Email inválido rejeitado - ' + e.issues[0]?.message);
}

// Teste 3
try {
  RegisterSchema.parse({ email: 'test@example.com', password: '123' });
  testFail('Teste 3: Senha curta não foi rejeitada', '');
} catch (e) {
  testPass('Teste 3: Senha curta rejeitada - ' + e.issues[0]?.message);
}

// Teste 4
try {
  GenerateReplySchema.parse({ reviewText: 'Bom', rating: 10, tone: 'friendly' });
  testFail('Teste 4: Rating > 5 não foi rejeitado', '');
} catch (e) {
  testPass('Teste 4: Rating fora de range rejeitado - ' + e.issues[0]?.message);
}

// Teste 5
try {
  GenerateReplySchema.parse({ reviewText: 'Bom', rating: 4.5, tone: 'friendly' });
  testFail('Teste 5: Rating decimal não foi rejeitado', '');
} catch (e) {
  testPass('Teste 5: Rating decimal rejeitado - ' + e.issues[0]?.message);
}

// Teste 6
try {
  GenerateReplySchema.parse({ reviewText: 'a'.repeat(2001), rating: 5, tone: 'friendly' });
  testFail('Teste 6: reviewText > 2000 não foi rejeitado', '');
} catch (e) {
  testPass('Teste 6: reviewText grande rejeitado - ' + e.issues[0]?.message);
}

// Teste 7
try {
  GenerateReplySchema.parse({
    reviewText: 'Bom',
    rating: 5,
    tone: 'friendly',
    additionalContext: 'x'.repeat(301),
  });
  testFail('Teste 7: additionalContext > 300 não foi rejeitado', '');
} catch (e) {
  testPass('Teste 7: additionalContext grande rejeitado - ' + e.issues[0]?.message);
}

// Teste 8
try {
  GenerateReplySchema.parse({ reviewText: 'Bom', rating: 5, tone: 'agressivo' });
  testFail('Teste 8: Tone inválido não foi rejeitado', '');
} catch (e) {
  testPass('Teste 8: Tone inválido rejeitado - ' + e.issues[0]?.message);
}

// ─── TESTES DE SANITIZAÇÃO ───────────────────────────────────────────────

console.log('\n--- SANITIZAÇÃO ---\n');

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

// Teste 9
const rev9 = sanitizeReviewText('Ótimo <script>alert(1)</script> serviço');
if (rev9 === 'Ótimo alert(1) serviço') {
  testPass('Teste 9: <script> tags removidas');
} else {
  testFail('Teste 9', `Esperado: "Ótimo alert(1) serviço", Obtido: "${rev9}"`);
}

// Teste 10
const ctx10 = sanitizeAdditionalContext('Mencione <b>promoção</b>');
if (ctx10 === 'Mencione promoção') {
  testPass('Teste 10: <b> tags removidas');
} else {
  testFail('Teste 10', `Esperado: "Mencione promoção", Obtido: "${ctx10}"`);
}

// Teste 11
const rev11 = sanitizeReviewText('a'.repeat(2500));
if (rev11.length === 2000) {
  testPass('Teste 11: reviewText truncado em 2000 chars');
} else {
  testFail('Teste 11', `Esperado 2000, Obtido ${rev11.length}`);
}

// Teste 12
const ctx12 = sanitizeAdditionalContext('x'.repeat(500));
if ((ctx12?.length || 0) === 300) {
  testPass('Teste 12: additionalContext truncado em 300 chars');
} else {
  testFail('Teste 12', `Esperado 300, Obtido ${ctx12?.length || 0}`);
}

// Teste 13
const rev13 = sanitizeReviewText('Adorei <img src="x"/> o <iframe></iframe> atendimento!');
if (!rev13.includes('<') && !rev13.includes('>') && rev13.includes('Adorei')) {
  testPass('Teste 13: Múltiplas tags HTML removidas');
} else {
  testFail('Teste 13', `Resultado: "${rev13}"`);
}

// ─── RESUMO ───────────────────────────────────────────────────

console.log(`\n=== RESULTADO FINAL ===\n`);
console.log(`✅ Testes passados: ${passCount}`);
console.log(`❌ Testes falhados: ${failCount}`);
console.log(`📊 Taxa de sucesso: ${((passCount / (passCount + failCount)) * 100).toFixed(1)}%\n`);

if (failCount === 0) {
  console.log('🎉 TODOS OS TESTES PASSARAM! A segurança está funcionando corretamente.\n');
} else {
  console.log('⚠️  Alguns testes falharam. Verifique os erros acima.\n');
}
