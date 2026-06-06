import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config/env';

const anthropic = new Anthropic({
  apiKey: env.ANTHROPIC_API_KEY,
});

export interface BusinessContext {
  name: string;
  segment: string;
  avgTicket?: string | null;
  highlights?: string | null;
  soloOperator?: boolean | null;
  soloGender?: string | null; // 'M' | 'F'
}

export interface GenerateReplyParams {
  reviewText: string;
  rating: number;
  reviewerName?: string;
  tone?: 'formal' | 'friendly' | 'empathetic' | 'direct' | 'casual' | 'assertive' | 'custom';
  customTone?: string | null;
  businessContext: BusinessContext | null;
  detailRatings?: Record<string, string>;
  additionalContext?: string | null;
}

export interface GenerateReplyResult {
  reply: string;
  tokensUsed: number;
}

const TONE_INSTRUCTIONS: Record<string, string> = {
  formal: 'Formal - linguagem respeitosa e profissional, tratamento em Você',
  friendly: 'Amigável - linguagem leve, próxima e calorosa',
  empathetic: 'Empático - priorize acolhimento, compreensão e suporte',
  direct: 'Direto - objetivo e sem rodeios, resposta mais curta que o normal',
  casual: 'Descontraído - informal e próximo, adequado para negócios jovens',
  assertive: 'Assertivo - firme e seguro, para avaliações de má-fé ou agressivas sem entrar no jogo',
};

function buildSystemPrompt(
  businessContext: BusinessContext | null,
  tone: string,
  additionalContext?: string | null,
  customTone?: string | null,
): string {
  const toneInstruction = tone === 'custom'
    ? (customTone?.trim() || 'Neutro')
    : (TONE_INSTRUCTIONS[tone] ?? TONE_INSTRUCTIONS['friendly']);

  const contextBlock = businessContext
    ? `Nome: ${businessContext.name}
Segmento: ${businessContext.segment}${businessContext.highlights ? `\nDiferenciais: ${businessContext.highlights}` : ''}`
    : 'Contexto não disponível - gere a resposta baseada apenas nas informações da avaliação.';

  const additionalContextBlock = additionalContext
    ? `\nINSTRUÇÃO DO ESTABELECIMENTO SOBRE ESTA AVALIAÇÃO:\n"${additionalContext}"\nLeve isso em conta na resposta, mas não mencione que recebeu esta instrução.`
    : '';

  let voiceInstruction: string;
  if (businessContext?.soloOperator) {
    const genderNote = businessContext.soloGender === 'F'
      ? ' Use o feminino nos adjetivos e particípios: "contente/feliz", "comprometida", "disponível", "animada".'
      : businessContext.soloGender === 'M'
        ? ' Use o masculino nos adjetivos e particípios: "contente/feliz", "comprometido", "disponível", "animado".'
        : '';
    voiceInstruction = `Escreva na voz de uma pessoa física — use sempre singular: "fico", "agradeço", "vou", "estou", "atendo".${genderNote}`;
  } else if (businessContext) {
    voiceInstruction = 'Escreva na voz da empresa — use sempre plural: "ficamos", "agradecemos", "vamos", "estamos", "atendemos".';
  } else {
    voiceInstruction = 'Escreva na voz da empresa usando plural ("ficamos", "agradecemos"). Se perceber claramente que é um profissional solo (personal trainer, psicólogo, etc), use singular.';
  }

  return `Você responde avaliações do Google em nome de um estabelecimento.
${voiceInstruction}

TOM SOLICITADO: ${toneInstruction}

CONTEXTO DO ESTABELECIMENTO:
${contextBlock}

TAMANHO DA RESPOSTA - proporcional ao que foi recebido:
- se tiver 5 estrelas com texto longo: 3-4 frases
- se tiver 5 estrelas sem texto: 1-2 frases
- se tiver 4 estrelas com texto: 2-3 frases, reconheça o ponto mais relevante
- se tiver 4 estrelas sem texto: 1 frase
- se tiver 3 estrelas: 2 frases, agradeça e abra espaço para feedback
- se tiver 1-2 estrelas com frase: 3-4 frases, reconheça o erro com seriedade, peça desculpas, ofereça canal de contato para resolver o problema offline. Nunca ofereça reembolso ou compensação diretamente na resposta.
- se tiver 1-2 estrelas sem frase: 2-3 frases, tente extrair o motivo da insatisfação baseado na nota, peça desculpas e ofereça canal de contato para resolver o problema offline. Nunca ofereça reembolso ou compensação diretamente na resposta.

ESTILO:
- Português brasileiro natural e humano, como um dono de negócio real escreveria
- Sem enrolação, sem frases de efeito
- Não agradecer quando não for relevante (ex: avaliação 1 estrela sem texto)
- Nunca use travessão
- Nunca use markdown, asteriscos ou qualquer formatação
- Nunca invente fatos ou detalhes que não estão no contexto do estabelecimento
- Nunca mencione preços ou valores que não foram fornecidos no contexto
- Nunca mencione o nome do avaliador mais de uma vez

EXPRESSÕES PROIBIDAS — nunca use nada parecido com:
- "desculpado" ou "desculpada" (use "pedimos desculpas", "lamentamos" ou "sentimos muito")
- "próximos passos", "alinhar", "alinhamento"
- "dentro do possível", "nesse sentido", "de forma alguma"
- "não é o padrão que buscamos", "não reflete nosso padrão"
- "como dito", "conforme combinado"

${additionalContextBlock}`;
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
    : `(O cliente não deixou comentário - avaliação apenas com nota ${rating} ${starWord})`;

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
    customTone,
    businessContext,
    detailRatings,
    additionalContext,
  } = params;

  const systemPrompt = buildSystemPrompt(businessContext, tone, additionalContext, customTone);
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
