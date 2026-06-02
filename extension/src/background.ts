// background.ts — service worker da extensão
// Gerencia estado global, gera respostas via api.ts e responde ao painel via long-lived port.

import { getStorage, setStorage } from './shared/storage';
import { generateReply } from './shared/api';
import { ApiError, ReviewData, ExtensionMessage } from './shared/types';

// ─── Estado global do service worker ─────────────────────────────────────────
// O service worker pode ser suspenso e reiniciado pelo Chrome; o estado abaixo
// é portanto efêmero (sobrevive apenas enquanto o SW está ativo).

let _currentUserPlan: string | null = null;

// ─── Instalação ───────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  console.log('[Respondera] extensão instalada/atualizada');
});

// ─── Mensagens simples (sendMessage) ─────────────────────────────────────────

chrome.runtime.onMessage.addListener((message: ExtensionMessage | { type: string }) => {
  if (message.type === 'RESPONDERA_LOGGED_IN' || message.type === 'SESSION_EXPIRED') {
    _currentUserPlan = null; // invalida cache em memória
  }
  return false;
});

// ─── Long-lived port (connect) ────────────────────────────────────────────────

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'respondera-reply') return;

  port.onMessage.addListener(async (message: ExtensionMessage) => {
    if (message.type !== 'GENERATE_REPLY') return;

    try {
      const result = await handleGenerateReply(message.data);
      port.postMessage(result);
    } catch (err) {
      console.error('[Respondera background]', err);
      port.postMessage({ error: 'Erro interno. Tente novamente.' });
    }
  });
});

// ─── Geração de resposta ──────────────────────────────────────────────────────

async function handleGenerateReply(
  data: ReviewData,
): Promise<{ reply?: string; error?: string }> {
  const token = await getStorage('authToken');
  if (!token) {
    return { error: 'login:Você precisa fazer login na extensão Respondera.' };
  }

  try {
    const rating = data.rating ?? 5;
    const starWord = rating === 1 ? 'estrela' : 'estrelas';
    // Avaliações sem comentário recebem texto sintético para o backend não retornar 400
    const reviewText = data.text?.trim()
      ? data.text
      : `(Avaliação sem comentário escrito — apenas ${rating} ${starWord})`;

    const result = await generateReply({
      reviewText,
      rating,
      reviewerName: data.reviewerName ?? undefined,
      tone:         data.tone ?? 'friendly',
      customTone:   data.customTone ?? null,
      detailRatings: data.detailRatings,
      additionalContext: data.additionalContext ?? null,
    });

    // Atualiza contador de uso no storage
    const currentUsage = await getStorage('usageCount');
    if (currentUsage !== null) {
      await setStorage('usageCount', currentUsage + 1);
    }

    return { reply: result.reply };
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.code === 'SESSION_EXPIRED') {
        _currentUserPlan = null;
        return { error: 'login:' + err.message };
      }
      if (err.code === 'USAGE_LIMIT_REACHED') {
        return { error: 'limite:' + err.message };
      }
      return { error: err.message };
    }
    return { error: 'Erro ao gerar resposta. Tente novamente.' };
  }
}
