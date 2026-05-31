import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export interface BusinessContext {
  name: string;
  segment: string;
  avgTicket?: string | null;
  highlights?: string | null;
}

export interface GenerateReplyParams {
  reviewText: string;
  rating: number;
  reviewerName?: string;
  tone?: 'formal' | 'friendly' | 'empathetic';
  businessContext: BusinessContext | null;
}

export interface GenerateReplyResult {
  reply: string;
  tokensUsed: number;
}

const TONE_INSTRUCTIONS: Record<string, string> = {
  formal: 'Formal — linguagem respeitosa e profissional, tratamento em Você',
  friendly: 'Amigável — linguagem leve, próxima e calorosa',
  empathetic: 'Empático — priorize acolhimento, compreensão e suporte',
};

function buildSystemPrompt(businessContext: BusinessContext | null, tone: string): string {
  const toneInstruction = TONE_INSTRUCTIONS[tone] ?? TONE_INSTRUCTIONS['friendly'];

  const contextBlock = businessContext
    ? `Nome: ${businessContext.name}
Segmento: ${businessContext.segment}${
        businessContext.highlights ? `\nDiferenciais: ${businessContext.highlights}` : ''
      }`
    : 'Contexto n\u00e3o dispon\u00edvel — gere a resposta baseada apenas nas informa\u00e7\u00f5es da avalia\u00e7\u00e3o.';

  return `Voc\u00ea \u00e9 um assistente especializado em gest\u00e3o de reputa\u00e7\u00e3o online para pequenos neg\u00f3cios.
Sua fun\u00e7\u00e3o \u00e9 gerar respostas profissionais, aut\u00eanticas e personalizadas para avalia\u00e7\u00f5es do Google.

REGRAS:
- A resposta deve ser em portugu\u00eas brasileiro
- Nunca invente fatos sobre o estabelecimento
- Nunca mencione valores, pre\u00e7os ou tickets m\u00e9dios que n\u00e3o foram fornecidos no contexto
- Se a avalia\u00e7\u00e3o mencionar um valor que parece inconsistente com o contexto, aborde isso gentilmente na resposta
- Para avalia\u00e7\u00f5es negativas (1-2 estrelas): reconhe\u00e7a o problema, pe\u00e7a desculpas, ofere\u00e7a solu\u00e7\u00e3o
- Para avalia\u00e7\u00f5es positivas (4-5 estrelas): agrade\u00e7a com entusiasmo mas sem exagero
- Para avalia\u00e7\u00f5es neutras (3 estrelas): agrade\u00e7a e pergunte o que pode melhorar
- M\u00e1ximo de 150 palavras na resposta
- Tom solicitado: ${toneInstruction}

CONTEXTO DO ESTABELECIMENTO:
${contextBlock}`;
}

function buildUserPrompt(reviewText: string, rating: number, reviewerName: string): string {
  return `Avalia\u00e7\u00e3o recebida:
Nota: ${rating}/5 estrelas
Avaliador: ${reviewerName}
Texto: ${reviewText || 'Sem texto, apenas nota'}

Gere uma resposta adequada para esta avalia\u00e7\u00e3o.`;
}

export async function generateReply(params: GenerateReplyParams): Promise<GenerateReplyResult> {
  const {
    reviewText,
    rating,
    reviewerName = 'Cliente',
    tone = 'friendly',
    businessContext,
  } = params;

  const systemPrompt = buildSystemPrompt(businessContext, tone);
  const userPrompt = buildUserPrompt(reviewText, rating, reviewerName);

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 512,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const content = message.content[0];
  if (content.type !== 'text') {
    throw new Error('Resposta inesperada da API da Anthropic.');
  }

  return {
    reply: content.text,
    tokensUsed: message.usage.input_tokens + message.usage.output_tokens,
  };
}
