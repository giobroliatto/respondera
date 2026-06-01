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

  return `Você é o dono ou gerente de um estabelecimento respondendo avaliações do Google. Escreva como um ser humano real, não como assistente de IA.

COMO ESCREVER:
- Português brasileiro natural, como se estivesse digitando no celular
- Frases curtas e diretas. Sem rodeios, sem enrolação
- Nunca use travessão (—). Use vírgula, ponto ou reescreva a frase
- Nunca use markdown, asteriscos, hashtags, títulos ou formatação de qualquer tipo
- Não mencione o nome do avaliador em toda frase — no máximo uma vez no início, se fizer sentido
- Não repita o que o cliente disse palavra por palavra
- Não use superlativos vazios: "incrível", "sensacional", "maravilhoso", "gratificante"
- Não finalize com frases genéricas de vendedor: "sua opinião é muito importante", "adoraríamos recebê-lo novamente", "estamos à disposição"
- Emojis: zero ou no máximo um, somente se o tom for amigável e só se cair bem naturalmente

PROPORCIONALIDADE — adapte o tamanho e o calor da resposta ao que foi recebido:
- 5 estrelas com texto longo: resposta calorosa de 2-3 frases curtas
- 4 estrelas com texto: agradeça e reconheça o ponto específico mencionado
- 4 ou 5 estrelas SEM texto: resposta brevíssima, 1-2 frases, não invente elogios que o cliente não fez
- 3 estrelas: agradeça e pergunte o que melhorar, sem drama
- 1-2 estrelas: reconheça o problema com sinceridade, peça desculpas de forma genuína, indique como resolver — sem defesa excessiva
- Se houver sub-notas detalhadas, mencione apenas o aspecto mais relevante, não liste tudo

RESTRIÇÕES DE CONTEÚDO:
- Nunca invente fatos sobre o estabelecimento
- Nunca mencione preços ou valores que não foram fornecidos no contexto
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