// panel.ts — executado dentro do iframe do painel lateral
// Recebe os dados da avaliação via postMessage, gera resposta via background e
// devolve a resposta ao content script para inserção no DOM da página.

import { PanelState, ToneOption, ReviewData } from '../shared/types';

// ─── Estado do painel ─────────────────────────────────────────────────────────

let currentReviewData: ReviewData | null = null;
let currentState: PanelState = 'idle';
let selectedTone: ToneOption = 'friendly';

// ─── Referências DOM ─────────────────────────────────────────────────────────

const el = {
  reviewerName:      () => document.getElementById('reviewer-name')!,
  ratingStars:       () => document.getElementById('rating-stars')!,
  reviewText:        () => document.getElementById('review-text')!,
  replySection:      () => document.getElementById('reply-section')!,
  replyTextarea:     () => document.getElementById('reply-textarea') as HTMLTextAreaElement,
  loadingSection:    () => document.getElementById('loading-section')!,
  errorSection:      () => document.getElementById('error-section')!,
  errorMessage:      () => document.getElementById('error-message')!,
  notLoggedSection:  () => document.getElementById('not-logged-section')!,
  limitSection:      () => document.getElementById('limit-section')!,
  btnGenerate:       () => document.getElementById('btn-generate') as HTMLButtonElement,
  btnRegenerate:     () => document.getElementById('btn-regenerate') as HTMLButtonElement,
  btnUse:            () => document.getElementById('btn-use') as HTMLButtonElement,
  btnClose:          () => document.getElementById('btn-close') as HTMLButtonElement,
  btnRecheckAuth:    () => document.getElementById('btn-recheck-auth') as HTMLButtonElement,
  usageInfo:         () => document.getElementById('usage-info')!,
  additionalContext: () => document.getElementById('rg-additional-context') as HTMLTextAreaElement,
  charCount:         () => document.getElementById('rg-char-count')!,
};

// ─── Controle de estado ───────────────────────────────────────────────────────

function setState(state: PanelState): void {
  currentState = state;

  // Oculta todas as seções dinâmicas
  el.replySection().classList.add('hidden');
  el.loadingSection().classList.add('hidden');
  el.errorSection().classList.add('hidden');
  el.notLoggedSection().classList.add('hidden');
  el.limitSection().classList.add('hidden');

  // Reseta botões
  el.btnGenerate().classList.remove('hidden');
  el.btnGenerate().disabled = false;
  el.btnRegenerate().classList.add('hidden');
  el.btnUse().classList.add('hidden');

  switch (state) {
    case 'idle':
      break;

    case 'loading':
      el.loadingSection().classList.remove('hidden');
      el.btnGenerate().disabled = true;
      break;

    case 'success':
      el.replySection().classList.remove('hidden');
      el.btnGenerate().classList.add('hidden');
      el.btnRegenerate().classList.remove('hidden');
      el.btnUse().classList.remove('hidden');
      break;

    case 'error':
      el.errorSection().classList.remove('hidden');
      break;

    case 'limit_reached':
      el.limitSection().classList.remove('hidden');
      el.btnGenerate().classList.add('hidden');
      break;

    case 'not_logged_in':
      el.notLoggedSection().classList.remove('hidden');
      el.btnGenerate().classList.add('hidden');
      break;
  }
}

// ─── Utilitários ─────────────────────────────────────────────────────────────

function renderStars(rating: number | null): string {
  if (rating === null) return '';
  return '★'.repeat(rating) + '☆'.repeat(Math.max(0, 5 - rating));
}

function renderReview(data: ReviewData): void {
  el.reviewerName().textContent = data.reviewerName ?? 'Avaliador';
  el.ratingStars().textContent = renderStars(data.rating);
  el.ratingStars().setAttribute('aria-label', data.rating ? `${data.rating} estrelas` : '');
  el.reviewText().textContent = data.text ?? '(sem texto)';
}

function getFromStorage(key: string): Promise<string | number | null> {
  return new Promise((resolve) => {
    chrome.storage.local.get(key, (result) => {
      resolve(result[key] ?? null);
    });
  });
}

async function updateUsageFooter(): Promise<void> {
  const plan   = await getFromStorage('userPlan') as string | null;
  const usage  = await getFromStorage('usageCount') as number | null;

  if (!plan) {
    el.usageInfo().textContent = '';
    return;
  }

  if (plan === 'PRO') {
    el.usageInfo().textContent = 'Plano PRO';
  } else {
    el.usageInfo().textContent =
      usage !== null ? `${usage} de 10 respostas usadas este mês` : 'Plano FREE';
  }
}

async function checkAuth(): Promise<boolean> {
  const token = await getFromStorage('authToken');
  return token !== null;
}

// ─── Geração de resposta ─────────────────────────────────────────────────────

async function generateReply(): Promise<void> {
  if (!currentReviewData) return;

  const isLoggedIn = await checkAuth();
  if (!isLoggedIn) {
    setState('not_logged_in');
    return;
  }

  setState('loading');

  return new Promise<void>((resolve) => {
    const port = chrome.runtime.connect({ name: 'respondera-reply' });

    const timeoutId = setTimeout(() => {
      port.disconnect();
      el.errorMessage().textContent = 'Tempo esgotado. Tente novamente.';
      setState('error');
      resolve();
    }, 30_000);

    port.onMessage.addListener(async (response: { reply?: string; error?: string }) => {
      clearTimeout(timeoutId);
      port.disconnect();

      if (response.error) {
        // background prefixes errors with 'login:' or 'limite:' for typed handling
        if (response.error.startsWith('login:')) {
          setState('not_logged_in');
        } else if (response.error.startsWith('limite:')) {
          setState('limit_reached');
        } else {
          el.errorMessage().textContent = response.error;
          setState('error');
        }
      } else if (response.reply) {
        el.replyTextarea().value = response.reply;
        setState('success');
        await updateUsageFooter();
      }

      resolve();
    });

    port.onDisconnect.addListener(() => {
      clearTimeout(timeoutId);
      if (currentState === 'loading') {
        el.errorMessage().textContent = 'Conexão encerrada inesperadamente.';
        setState('error');
      }
      resolve();
    });

    port.postMessage({
      type: 'GENERATE_REPLY',
      data: {
        ...currentReviewData,
        tone: selectedTone,
        additionalContext: el.additionalContext().value.trim() || null,
      },
    });
  });
}

// ─── Inicialização ────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  await updateUsageFooter();

  // Seletor de tom
  document.querySelectorAll<HTMLButtonElement>('.tone-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tone-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      selectedTone = btn.dataset['tone'] as ToneOption;
    });
  });

  // Contador de caracteres do campo de contexto adicional
  el.additionalContext().addEventListener('input', () => {
    const len = el.additionalContext().value.length;
    const countEl = el.charCount();
    countEl.textContent = `${len}/300`;
    countEl.classList.toggle('rg-char-count--warn', len >= 200 && len < 300);
    countEl.classList.toggle('rg-char-count--full', len >= 300);
  });

  el.btnGenerate().addEventListener('click', generateReply);
  el.btnRegenerate().addEventListener('click', generateReply);

  // Usar resposta: envia ao content script e fecha
  el.btnUse().addEventListener('click', () => {
    const reply = el.replyTextarea().value.trim();
    if (!reply) return;
    window.parent.postMessage({ type: 'RESPONDERA_INSERT', reply }, '*');
  });

  // Fechar painel
  el.btnClose().addEventListener('click', () => {
    window.parent.postMessage({ type: 'RESPONDERA_CLOSE' }, '*');
  });

  // Re-verificar autenticação (usuário acabou de fazer login)
  el.btnRecheckAuth().addEventListener('click', async () => {
    if (await checkAuth()) {
      await updateUsageFooter();
      setState('idle');
    }
  });

  // Sinaliza ao content script que o painel está pronto para receber dados
  window.parent.postMessage({ type: 'RESPONDERA_READY' }, '*');
});

// ─── Mensagens recebidas do content script ────────────────────────────────────

window.addEventListener('message', (e) => {
  const msg = e.data as { type?: string; data?: ReviewData };

  if (msg?.type === 'RESPONDERA_DATA' && msg.data) {
    currentReviewData = msg.data;
    renderReview(currentReviewData);
    // Limpa o campo de contexto adicional a cada nova avaliação
    el.additionalContext().value = '';
    el.charCount().textContent = '0/300';
    el.charCount().classList.remove('rg-char-count--warn', 'rg-char-count--full');
    setState('idle');
  }

  if (msg?.type === 'RESPONDERA_AUTH_UPDATE' && currentState === 'not_logged_in') {
    updateUsageFooter();
    setState('idle');
  }
});
