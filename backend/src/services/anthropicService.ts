import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

interface GenerateReplyParams {
  reviewText: string;
  reviewerName: string;
  starRating: number;
  business: {
    name: string;
    segment: string;
    tone?: string | null;
    avgTicket?: string | null;
    highlights?: string | null;
  };
}

const TONE_INSTRUCTIONS: Record<string, string> = {
  FORMAL: 'Use linguagem formal, tratamento respeitoso (Você/Sr./Sra.) e evite informalidades.',
  NEUTRO: 'Use linguagem profissional e cordial, sem ser excessivamente formal nem informal.',
  DESCONTRAÍDO: 'Use linguagem leve, amigável e próxima, com um toque descontraído mas ainda respeitosa.',
};

export async function generateReply(params: GenerateReplyParams): Promise<string> {
  const { reviewText, reviewerName, starRating, business } = params;

  const toneKey = business.tone ?? 'NEUTRO';
  const toneInstruction = TONE_INSTRUCTIONS[toneKey] ?? TONE_INSTRUCTIONS['NEUTRO'];

  const systemPrompt = `Você é um especialista em atendimento ao cliente e gestão de reputação online.
Seu papel é redigir respostas profissionais, empáticas e personalizadas para avaliações do Google Meu Negócio.

Estabelecimento: ${business.name}
Segmento: ${business.segment}
${business.avgTicket ? `Ticket médio: ${business.avgTicket}` : ''}
${business.highlights ? `Diferenciais: ${business.highlights}` : ''}

Tom de comunicação: ${toneInstruction}

Diretrizes para as respostas:
- Mencione o nome do avaliador
- Para avaliações positivas (4-5 estrelas): agradeça, reforce os pontos positivos e convide para voltar
- Para avaliações neutras (3 estrelas): agradeça, reconheça o feedback e demonstre comprometimento com melhoria
- Para avaliações negativas (1-2 estrelas): demonstre empatia, peça desculpas, ofereça solução e contato privado
- Nunca seja defensivo ou agressivo
- Máximo de 3 parágrafos curtos
- Escreva em português do Brasil`;

  const userMessage = `Escreva uma resposta para a seguinte avaliação:

Avaliador: ${reviewerName}
Nota: ${starRating}/5 estrelas
Avaliação: "${reviewText}"`;

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 512,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });

  const content = message.content[0];
  if (content.type !== 'text') {
    throw new Error('Resposta inesperada da API da Anthropic.');
  }

  return content.text;
}
