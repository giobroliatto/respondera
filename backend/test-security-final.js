#!/usr/bin/env node

let schemas;
let sanitization;

try {
  schemas = require('./dist/utils/validationSchemas');
  sanitization = require('./dist/utils/sanitization');
} catch {
  console.error('Build nao encontrado. Rode `pnpm build` antes de executar este teste.');
  process.exit(1);
}

const { RegisterSchema, GenerateReplySchema } = schemas;
const { sanitizeReviewText, sanitizeAdditionalContext } = sanitization;

let passCount = 0;
let failCount = 0;

function testPass(name) {
  console.log(`OK  ${name}`);
  passCount++;
}

function testFail(name, error) {
  console.log(`ERR ${name}: ${error}`);
  failCount++;
}

function expectThrows(name, fn) {
  try {
    fn();
    testFail(name, 'nao rejeitou o dado invalido');
  } catch (err) {
    testPass(`${name} - ${err.issues?.[0]?.message ?? err.message}`);
  }
}

console.log('\n=== TESTES DE SEGURANCA - SCHEMAS REAIS ===\n');

try {
  RegisterSchema.parse({ email: 'test@example.com', password: 'senha123' });
  testPass('Email valido aceito');
} catch (err) {
  testFail('Email valido aceito', err.issues?.[0]?.message ?? err.message);
}

expectThrows('Email invalido rejeitado', () => {
  RegisterSchema.parse({ email: 'invalido', password: 'senha123' });
});

expectThrows('Senha curta rejeitada', () => {
  RegisterSchema.parse({ email: 'test@example.com', password: '123' });
});

expectThrows('Rating maior que 5 rejeitado', () => {
  GenerateReplySchema.parse({ reviewText: 'Bom', rating: 10, tone: 'friendly' });
});

expectThrows('Rating decimal rejeitado', () => {
  GenerateReplySchema.parse({ reviewText: 'Bom', rating: 4.5, tone: 'friendly' });
});

expectThrows('Review grande rejeitado', () => {
  GenerateReplySchema.parse({ reviewText: 'a'.repeat(2001), rating: 5, tone: 'friendly' });
});

expectThrows('Contexto adicional grande rejeitado', () => {
  GenerateReplySchema.parse({
    reviewText: 'Bom',
    rating: 5,
    tone: 'friendly',
    additionalContext: 'x'.repeat(301),
  });
});

expectThrows('Tone invalido rejeitado', () => {
  GenerateReplySchema.parse({ reviewText: 'Bom', rating: 5, tone: 'agressivo' });
});

try {
  const parsed = GenerateReplySchema.parse({ rating: 5, tone: 'friendly' });
  if (parsed.reviewText === '') {
    testPass('reviewText ausente vira string vazia');
  } else {
    testFail('reviewText ausente vira string vazia', `valor obtido: ${String(parsed.reviewText)}`);
  }
} catch (err) {
  testFail('reviewText ausente vira string vazia', err.issues?.[0]?.message ?? err.message);
}

try {
  GenerateReplySchema.parse({ reviewText: 'Bom', rating: 5, tone: 'custom', customTone: 'calmo' });
  GenerateReplySchema.parse({ reviewText: 'Bom', rating: 5, tone: 'assertive' });
  testPass('Tons PRO validos aceitos pelo schema');
} catch (err) {
  testFail('Tons PRO validos aceitos pelo schema', err.issues?.[0]?.message ?? err.message);
}

console.log('\n=== TESTES DE SANITIZACAO - FUNCOES REAIS ===\n');

const reviewWithoutScript = sanitizeReviewText('Otimo <script>alert(1)</script> servico');
if (reviewWithoutScript === 'Otimo alert(1) servico') {
  testPass('Tags script removidas de reviewText');
} else {
  testFail('Tags script removidas de reviewText', reviewWithoutScript);
}

const contextWithoutBold = sanitizeAdditionalContext('Mencione <b>promocao</b>');
if (contextWithoutBold === 'Mencione promocao') {
  testPass('Tags simples removidas de additionalContext');
} else {
  testFail('Tags simples removidas de additionalContext', String(contextWithoutBold));
}

const truncatedReview = sanitizeReviewText('a'.repeat(2500));
if (truncatedReview.length === 2000) {
  testPass('reviewText truncado em 2000 caracteres');
} else {
  testFail('reviewText truncado em 2000 caracteres', String(truncatedReview.length));
}

const truncatedContext = sanitizeAdditionalContext('x'.repeat(500));
if ((truncatedContext?.length ?? 0) === 300) {
  testPass('additionalContext truncado em 300 caracteres');
} else {
  testFail('additionalContext truncado em 300 caracteres', String(truncatedContext?.length ?? 0));
}

const multiTagReview = sanitizeReviewText('Adorei <img src="x"/> o <iframe></iframe> atendimento!');
if (!multiTagReview.includes('<') && !multiTagReview.includes('>') && multiTagReview.includes('Adorei')) {
  testPass('Multiplas tags HTML removidas');
} else {
  testFail('Multiplas tags HTML removidas', multiTagReview);
}

console.log('\n=== RESULTADO FINAL ===\n');
console.log(`Testes passados: ${passCount}`);
console.log(`Testes falhados: ${failCount}`);
console.log(`Taxa de sucesso: ${((passCount / (passCount + failCount)) * 100).toFixed(1)}%\n`);

if (failCount > 0) {
  process.exit(1);
}
