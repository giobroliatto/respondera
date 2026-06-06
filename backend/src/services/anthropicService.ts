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
      ? ' Quando usar adjetivos que concordam com o sujeito, use o feminino (ex: "feliz", "disponível", "animada", "comprometida") — mas só se o adjetivo soar natural na frase. Nunca force um adjetivo emocional só para concordar.'
      : businessContext.soloGender === 'M'
        ? ' Quando usar adjetivos que concordam com o sujeito, use o masculino (ex: "feliz", "disponível", "animado", "comprometido") — mas só se o adjetivo soar natural na frase. Nunca force um adjetivo emocional só para concordar.'
        : '';
    voiceInstruction = `Escreva na voz de uma pessoa física — você é o próprio dono/profissional respondendo.
SEMPRE use singular: "fico", "agradeço", "vou", "estou", "atendo", "lamento", "peço desculpas", "sinto muito", "comigo", "minha parte".
NUNCA use plural nem pronomes de grupo: "ficamos", "agradecemos", "lamentamos", "pedimos", "estamos", "vamos", "conosco", "nosso", "nossa", "nós", "nossa parte".
NUNCA use construções "fico + gerúndio" (ex: "fico lamentando", "fico me desculpando") — use o verbo direto: "lamento", "peço desculpas", "sinto muito".${genderNote}`;
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
- Português brasileiro direto e humano — como alguém responderia numa mensagem, não num comunicado oficial
- Sem dramatismo: um pedido de desculpas curto e honesto é mais humano do que um parágrafo explicando a gravidade do erro
- Prefira o coloquial ao formal: "que chato ter acontecido isso" é melhor do que "entendo que é frustrante quando o tempo não é respeitado"
- Evite intensificadores antes de emoções: não use "realmente", "profundamente", "sinceramente" antes de adjetivos
- Sem auto-flagelação pública: não diga "preciso melhorar", "vou trabalhar nisso" — reconheça o erro e ofereça solução, sem discurso
- Não analise o sentimento do cliente por ele: não diga "entendo que deve ter sido frustrante" — demonstre empatia na ação, não na análise
- Sem enrolação, sem frases de efeito
- Não agradecer quando não for relevante (ex: avaliação 1 estrela sem texto)
- Nunca use travessão
- Nunca use markdown, asteriscos ou qualquer formatação
- Nunca invente fatos ou detalhes que não estão no contexto do estabelecimento
- Nunca mencione preços ou valores que não foram fornecidos no contexto
- Nunca mencione o nome do avaliador mais de uma vez

EXPRESSÕES PROIBIDAS — nunca use nada parecido com:
- "desculpado" ou "desculpada" (use "peço desculpas", "lamento" ou "sinto muito")
- "arrependido" ou "arrependida" (use "lamento" ou "sinto muito")
- "realmente arrependido/a", "profundamente chateado/a", "sinceramente constrangido/a" — intensificadores teatrais
- "preciso melhorar", "vou trabalhar nisso", "estou trabalhando para melhorar" — auto-flagelação pública
- "entendo que é frustrante quando", "entendo o quanto isso deve ter sido" — análise do sentimento do cliente
- "próximos passos", "alinhar", "alinhamento"
- "dentro do possível", "nesse sentido", "de forma alguma"
- "não é o padrão que buscamos", "não reflete nosso padrão"
- "como dito", "conforme combinado"
- "sinta-se à vontade para entrar em contato" (use "pode me chamar", "é só me mandar mensagem")

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
