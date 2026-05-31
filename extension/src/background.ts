// background.ts — service worker da extensão
// Recebe mensagens do content script, chama o backend e devolve a resposta.

import { getStorage, setStorage } from './shared/storage';

chrome.runtime.onInstalled.addListener(() => {
  console.log('[Respondera] extensão instalada/atualizada');
});

interface ReviewData {
  text: string | null;
  rating: number | null;
  reviewerName: string | null;
  hasExistingReply: boolean;
}

interface GenerateReplyMessage {
  type: 'GENERATE_REPLY';
  data: ReviewData;
}

type IncomingMessage = GenerateReplyMessage;

chrome.runtime.onMessage.addListener(
  (message: IncomingMessage, _sender, sendResponse) => {
    if (message.type === 'GENERATE_REPLY') {
      handleGenerateReply(message.data).then(sendResponse).catch((err) => {
        console.error('[Respondera background]', err);
        sendResponse({ error: 'Erro interno. Tente novamente.' });
      });
      // Retorna true para manter o canal aberto até sendResponse ser chamado
      return true;
    }
  }
);

async function handleGenerateReply(
  data: ReviewData
): Promise<{ reply?: string; error?: string }> {
  const token = await getStorage('authToken');

  if (!token) {
    return { error: 'Você precisa fazer login na extensão Respondera.' };
  }

  const res = await fetch(`${BACKEND_URL}/reply/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      reviewText: data.text ?? '',
      rating: data.rating ?? 5,
      reviewerName: data.reviewerName ?? undefined,
      tone: 'friendly',
    }),
  });

  if (res.status === 401) {
    return { error: 'Sessão expirada. Faça login novamente na extensão.' };
  }

  if (res.status === 403) {
    return { error: 'Você atingiu o limite de respostas deste mês.' };
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    return { error: (body as { message?: string }).message ?? 'Erro ao gerar resposta.' };
  }

  const body = await res.json() as { reply: string; remainingUsage: number };

  // Atualiza o contador de uso no storage local
  const currentUsage = await getStorage('usageCount');
  if (currentUsage !== null) {
    await setStorage('usageCount', currentUsage + 1);
  }

  return { reply: body.reply };
}
