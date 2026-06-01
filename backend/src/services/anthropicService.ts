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
  detailRatings?: Record<string, string>;
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
Segmento: ${businessContext.segment}${businessContext.highlights ? `\nDiferenciais: ${businessContext.highlights}` : ''}`
    : 'Contexto não disponível — gere a resposta baseada apenas nas informações da avaliação.';

  return `Você é um assistente especializado em gestão de reputação online para pequenos negócios.
Sua função é gerar respostas profissionais, autênticas e personalizadas para avaliações do Google.

REGRAS:
- A resposta deve ser em português brasileiro
- Nunca invente fatos sobre o estabelecimento
- Nunca mencione valores, preços ou tickets médios que não foram fornecidos no contexto
- Se a avaliação mencionar um valor inconsistente com o contexto, aborde isso gentilmente
- Para avaliações negativas (1-2 estrelas): reconheça o problema, peça desculpas, ofereça solução
- Para avaliações positivas (4-5 estrelas): agradeça com entusiasmo mas sem exagero
- Para avaliações neutras (3 estrelas): agradeça e pergunte o que pode melhorar
- Para avaliações sem comentário: gere resposta genérica e calorosa adequada à nota
- Considere TODAS as informações adicionais da avaliação (comida, serviço, ambiente, preço etc.)
- Máximo de 150 palavras na resposta
- Tom solicitado: ${toneInstruction}

CONTEXTO DO ESTABELECIMENTO:
${contextBlock}`;
}

function buildUserPrompt(
  reviewText: string,
  rating: number,
  reviewerName: string,
  detailRatings?: Record<string, string>,
): string {
  const starWord = rating === 1 ? 'estrela' : 'estrelas';
  const commentBlock = reviewText.trim()
    ? `Comentário: ${reviewText}`
    : `(O cliente não deixou comentário — avaliação apenas com nota ${rating} ${starWord})`;

  let detailsBlock = '';
  if (detailRatings && Object.keys(detailRatings).length > 0) {
    const lines = Object.entries(detailRatings)
      .map(([k, v]) => `  - ${k}: ${v}`)
      .join('\n');
    detailsBlock = `\nInformações adicionais da avaliação:\n${lines}`;
  }

  return `Avaliação recebida:
Nota geral: ${rating}/5 ${starWord}
Avaliador: ${reviewerName}
${commentBlock}${detailsBlock}

Gere uma resposta adequada para esta avaliação.`;
}

export async function generateReply(params: GenerateReplyParams): Promise<GenerateReplyResult> {
  const {
    reviewText,
    rating,
    reviewerName = 'Cliente',
    tone = 'friendly',
    businessContext,
    detailRatings,
  } = params;

  const systemPrompt = buildSystemPrompt(businessContext, tone);
  const userPrompt = buildUserPrompt(reviewText, rating, reviewerName, detailRatings);

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