// panel.ts — executado dentro do iframe do painel lateral
// Recebe os dados da avaliação via postMessage, gera resposta via background e
// devolve a resposta ao content script para inserção no DOM da página.

import { PanelState, ToneOption, ReviewData } from '../shared/types';
import { getMe } from '../shared/api';

// ─── Estado do painel ─────────────────────────────────────────────────────────

let currentReviewData: ReviewData | null = null;
let currentState: PanelState = 'idle';
let selectedTone: ToneOption = 'friendly';
let userPlan: string | null = null;
let customToneValue: string | null = null;

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
  toneGroupPro:       () => document.getElementById('tone-group-pro')!,
  customToneRow:      () => document.getElementById('custom-tone-row')!,
  customToneInputWrap:() => document.getElementById('custom-tone-input-wrap')!,
  btnCustomTone:      () => document.getElementById('btn-custom-tone') as HTMLButtonElement,
  customToneInput:    () => document.getElementById('custom-tone-input') as HTMLInputElement,
  customToneCharCount:() => document.getElementById('custom-tone-char-count')!,
  proRequiredMsg:      () => document.getElementById('pro-required-msg')!,
  contextProMsg:       () => document.getElementById('context-pro-msg')!,
  contextWarningMsg:   () => document.getElementById('context-warning-msg'),
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

function autoResize(textarea: HTMLTextAreaElement): void {
  textarea.style.height = 'auto';
  textarea.style.height = `${textarea.scrollHeight}px`;
}

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

function setToStorage(data: Record<string, unknown>): Promise<void> {
  return new Promise((resolve) => chrome.storage.local.set(data, resolve));
}

async function syncPlanFromServer(): Promise<void> {
  try {
    const user = await getMe();
    await setToStorage({
      userPlan:           user.plan,
      usageCount:         user.usageCount,
      emailVerified:      user.emailVerified,
      renewalDate:        (user as any).mpNextBillingDate ?? null,
      subscriptionStatus: (user as any).mpSubscriptionStatus ?? null,
    });
  } catch {
    // Offline ou token expirado — usa cache local
  }
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

    port.onMessage.addListener(async (response: { reply?: string; error?: string; contextWarning?: string }) => {
      clearTimeout(timeoutId);
      port.disconnect();

      const warningEl = el.contextWarningMsg?.();
      if (warningEl) {
        warningEl.classList.add('hidden');
        warningEl.textContent = '';
      }

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
        autoResize(el.replyTextarea());
        await updateUsageFooter();
        if (response.contextWarning && warningEl) {
          warningEl.textContent = response.contextWarning;
          warningEl.classList.remove('hidden');
        }
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
        tone: customToneValue ? ('custom' as ToneOption) : selectedTone,
        customTone: customToneValue,
        additionalContext: userPlan === 'PRO' ? (el.additionalContext().value.trim() || null) : null,
      },
    });
  });
}

// ─── Refresh após login com painel aberto ────────────────────────────────────

async function refreshPlanState(): Promise<void> {
  // Clona os botões PRO para remover os listeners do caminho FREE (show "PRO required")
  document.querySelectorAll<HTMLButtonElement>('.tone-btn-pro').forEach((btn) => {
    btn.replaceWith(btn.cloneNode(true));
  });

  // Clona o toggle de tom personalizado pelo mesmo motivo
  const customToggle = el.btnCustomTone();
  customToggle.replaceWith(customToggle.cloneNode(true));

  // Remove classes de bloqueio adicionadas pelo caminho FREE
  document.querySelectorAll('.tone-btn-pro--locked').forEach((b) => b.classList.remove('tone-btn-pro--locked'));
  el.btnCustomTone().classList.remove('tone-custom-toggle--locked');

  // Re-habilita o campo de contexto adicional (desabilitado para FREE)
  el.additionalContext().disabled = false;
  el.contextProMsg().classList.add('hidden');

  // Re-inicializa a seção de tons com o plano correto (lê storage atualizado)
  await initToneSection();

  // Aplica o tom padrão salvo (ou friendly como fallback)
  const proTones = ['direct', 'casual', 'assertive'];
  const savedTone = await getFromStorage('defaultTone') as string | null;
  const canApply = savedTone && (userPlan === 'PRO' || !proTones.includes(savedTone));
  const toneToApply = (canApply ? savedTone! : 'friendly') as ToneOption;
  document.querySelectorAll('.tone-btn').forEach((b) => b.classList.remove('active'));
  document.querySelector<HTMLButtonElement>(`.tone-btn[data-tone="${toneToApply}"]`)?.classList.add('active');
  selectedTone = toneToApply;
}

// ─── Inicialização de tons PRO ────────────────────────────────────────────────

async function initToneSection(): Promise<void> {
  userPlan = await getFromStorage('userPlan') as string | null;

  if (userPlan === 'PRO') {
    // Handlers para tons PRO
    document.querySelectorAll<HTMLButtonElement>('.tone-btn-pro').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tone-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        selectedTone = btn.dataset['tone'] as ToneOption;
        // Limpa tom personalizado ao selecionar tom pré-definido
        customToneValue = null;
        el.customToneInput().value = '';
        el.customToneCharCount().textContent = '0/100';
        el.btnCustomTone().classList.remove('active');
        el.customToneInputWrap().classList.add('hidden');
      });
    });

    // Toggle do campo de tom personalizado
    el.btnCustomTone().addEventListener('click', () => {
      const isHidden = el.customToneInputWrap().classList.contains('hidden');
      if (isHidden) {
        el.customToneInputWrap().classList.remove('hidden');
        el.customToneInput().focus();
        el.btnCustomTone().classList.add('active');
      } else {
        el.customToneInputWrap().classList.add('hidden');
        el.customToneInput().value = '';
        el.customToneCharCount().textContent = '0/100';
        customToneValue = null;
        el.btnCustomTone().classList.remove('active');
        if (!document.querySelector('.tone-btn.active')) {
          document.querySelector<HTMLButtonElement>('.tone-btn[data-tone="friendly"]')?.classList.add('active');
          selectedTone = 'friendly';
        }
      }
    });

    // Input do tom personalizado
    el.customToneInput().addEventListener('input', () => {
      const val = el.customToneInput().value;
      el.customToneCharCount().textContent = `${val.length}/100`;
      customToneValue = val.trim() || null;
      if (customToneValue) {
        document.querySelectorAll('.tone-btn').forEach((b) => b.classList.remove('active'));
      } else if (!document.querySelector('.tone-btn.active')) {
        document.querySelector<HTMLButtonElement>(`.tone-btn[data-tone="${selectedTone}"]`)?.classList.add('active');
      }
    });
  } else {
    // FREE: bloqueia o campo de contexto adicional
    el.additionalContext().disabled = true;
    el.contextProMsg().classList.remove('hidden');

    // Tons PRO: visíveis mas bloqueados para FREE — clique abre upgrade
    document.querySelectorAll<HTMLButtonElement>('.tone-btn-pro').forEach((btn) => {
      btn.classList.add('tone-btn-pro--locked');
      btn.addEventListener('click', () => {
        chrome.tabs.create({ url: 'https://respondera.com.br/upgrade.html' });
      });
    });

    // Tom personalizado: visível mas bloqueado para FREE — clique abre upgrade
    el.btnCustomTone().classList.add('tone-custom-toggle--locked');
    el.btnCustomTone().addEventListener('click', () => {
      chrome.tabs.create({ url: 'https://respondera.com.br/upgrade.html' });
    });
  }
}

// ─── Inicialização ────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  // Sincroniza plano com o servidor antes de renderizar (captura auto-downgrade etc.)
  await syncPlanFromServer();

  await updateUsageFooter();

  // Seletor de tom — tons base (FREE + PRO)
  document.querySelectorAll<HTMLButtonElement>('#tone-group-base .tone-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tone-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      selectedTone = btn.dataset['tone'] as ToneOption;
      // Limpa tom personalizado ao selecionar tom padrão
      customToneValue = null;
      el.customToneInput().value = '';
      el.customToneCharCount().textContent = '0/100';
      el.btnCustomTone().classList.remove('active');
      el.customToneInputWrap().classList.add('hidden');
    });
  });

  await initToneSection();

  // Contador de caracteres do campo de contexto adicional
  el.additionalContext().addEventListener('input', () => {
    const len = el.additionalContext().value.length;
    const countEl = el.charCount();
    countEl.textContent = `${len}/300`;
    countEl.classList.toggle('rg-char-count--warn', len >= 200 && len < 300);
    countEl.classList.toggle('rg-char-count--full', len >= 300);
  });

  el.replyTextarea().addEventListener('input', () => autoResize(el.replyTextarea()));

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

  // Detecta login enquanto o painel está aberto via storage (mais confiável que postMessage)
  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area !== 'local') return;

    // userPlan gravado = storeUserData completou authToken + plan (momento seguro)
    // oldValue undefined = veio de clearStorage (logout), ou seja, é um novo login
    if (changes['userPlan']?.newValue && !changes['userPlan']?.oldValue) {
      await refreshPlanState();
      await updateUsageFooter();
      if (currentState === 'not_logged_in') setState('idle');
    }

    // defaultTone populado pelo getBusiness background de showHome
    if (changes['defaultTone']?.newValue && currentState === 'idle') {
      const newTone = changes['defaultTone'].newValue as string;
      const proTones = ['direct', 'casual', 'assertive'];
      if (userPlan === 'PRO' || !proTones.includes(newTone)) {
        selectedTone = newTone as ToneOption;
        document.querySelectorAll('.tone-btn').forEach((b) => b.classList.remove('active'));
        document.querySelector<HTMLButtonElement>(`.tone-btn[data-tone="${newTone}"]`)?.classList.add('active');
      }
    }
  });

  // Sinaliza ao content script que o painel está pronto para receber dados
  window.parent.postMessage({ type: 'RESPONDERA_READY' }, '*');
});

// ─── Mensagens recebidas do content script ────────────────────────────────────

window.addEventListener('message', async (e) => {
  const msg = e.data as { type?: string; data?: ReviewData };

  if (msg?.type === 'RESPONDERA_DATA' && msg.data) {
    document.getElementById('panel-loading')?.classList.add('hidden');
    currentReviewData = msg.data;
    renderReview(currentReviewData);
    // Limpa contexto adicional
    el.additionalContext().value = '';
    el.charCount().textContent = '0/300';
    el.charCount().classList.remove('rg-char-count--warn', 'rg-char-count--full');
    // Limpa tom personalizado
    customToneValue = null;
    el.customToneInput().value = '';
    el.customToneCharCount().textContent = '0/100';
    el.btnCustomTone().classList.remove('active');
    el.customToneInputWrap().classList.add('hidden');
    // Aplica tom padrão salvo (ou friendly como fallback)
    const proTones = ['direct', 'casual', 'assertive'];
    const savedTone = await getFromStorage('defaultTone') as string | null;
    const canApply = savedTone && (userPlan === 'PRO' || !proTones.includes(savedTone));
    const toneToApply = canApply ? savedTone! : 'friendly';
    document.querySelectorAll('.tone-btn').forEach((b) => b.classList.remove('active'));
    document.querySelector<HTMLButtonElement>(`.tone-btn[data-tone="${toneToApply}"]`)?.classList.add('active');
    selectedTone = toneToApply as ToneOption;
    setState('idle');
  }

  if (msg?.type === 'RESPONDERA_AUTH_UPDATE' && currentState === 'not_logged_in') {
    await refreshPlanState();
    await updateUsageFooter();
    setState('idle');
  }
});
