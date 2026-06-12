// panel.ts — executado dentro do iframe do painel lateral
// Recebe os dados da avaliação via postMessage, gera resposta via background e
// devolve a resposta ao content script para inserção no DOM da página.

import { PanelState, ToneOption, ReviewData } from '../shared/types';
import { getMe } from '../shared/api';

// ─── Interfaces ───────────────────────────────────────────────────────────────

interface SavedTone {
  id: string;
  name: string;
  description: string;
}

// ─── Estado do painel ─────────────────────────────────────────────────────────

let currentReviewData: ReviewData | null = null;
let currentState: PanelState = 'idle';
let selectedTone: ToneOption = 'friendly';
let userPlan: string | null = null;
let customToneValue: string | null = null;
let activeSavedToneId: string | null = null;
let editingToneId: string | null = null;

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

// ─── Tons personalizados salvos ───────────────────────────────────────────────

function getSavedTonesFromStorage(): Promise<SavedTone[]> {
  return new Promise((resolve) => {
    chrome.storage.sync.get('savedCustomTones', (result) => {
      resolve((result['savedCustomTones'] as SavedTone[]) ?? []);
    });
  });
}

function setSavedTonesInStorage(tones: SavedTone[]): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.sync.set({ savedCustomTones: tones }, resolve);
  });
}

function renderSavedTones(tones: SavedTone[]): void {
  const list = document.getElementById('saved-tones-list');
  if (!list) return;
  list.innerHTML = '';

  tones.forEach((tone) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'saved-tone-btn' + (tone.id === activeSavedToneId ? ' active' : '');
    btn.dataset['id'] = tone.id;
    btn.dataset['tooltip'] = tone.description;

    const nameSpan = document.createElement('span');
    nameSpan.className = 'tone-name';
    nameSpan.textContent = tone.name;

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'saved-tone-edit';
    editBtn.innerHTML = '<svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><path d="M20.9888 4.28491L19.6405 2.93089C18.4045 1.6897 16.4944 1.6897 15.2584 2.93089L13.0112 5.30042L18.7416 11.055L21.1011 8.68547C21.6629 8.1213 22 7.33145 22 6.54161C22 5.75176 21.5506 4.84908 20.9888 4.28491Z"/><path d="M16.2697 10.9422L11.7753 6.42877L2.89888 15.3427C2.33708 15.9069 2 16.6968 2 17.5994V21.0973C2 21.5487 2.33708 22 2.89888 22H6.49438C7.2809 22 8.06742 21.6615 8.74157 21.0973L17.618 12.1834L16.2697 10.9422Z"/></svg>';
    editBtn.title = 'Editar tom';

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'saved-tone-delete';
    delBtn.textContent = '×';
    delBtn.title = 'Remover tom';

    btn.appendChild(nameSpan);
    btn.appendChild(editBtn);
    btn.appendChild(delBtn);
    list.appendChild(btn);

    btn.addEventListener('click', (e) => {
      if ((e.target as Element).closest('.saved-tone-edit, .saved-tone-delete')) return;
      selectSavedTone(tone);
    });

    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openEditForm(tone);
    });

    delBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (delBtn.dataset['confirm'] === '1') {
        clearTimeout(Number(delBtn.dataset['timer']));
        const all = await getSavedTonesFromStorage();
        const updated = all.filter((t) => t.id !== tone.id);
        await setSavedTonesInStorage(updated);
        if (activeSavedToneId === tone.id) {
          activeSavedToneId = null;
          customToneValue = null;
          document.querySelectorAll('.tone-btn').forEach((b) => b.classList.remove('active'));
          document.querySelector<HTMLButtonElement>('.tone-btn[data-tone="friendly"]')?.classList.add('active');
          selectedTone = 'friendly';
        }
        renderSavedTones(updated);
      } else {
        delBtn.dataset['confirm'] = '1';
        delBtn.textContent = '?';
        delBtn.classList.add('saved-tone-delete--confirm');
        const timer = window.setTimeout(() => {
          delete delBtn.dataset['confirm'];
          delBtn.textContent = '×';
          delBtn.classList.remove('saved-tone-delete--confirm');
        }, 2500);
        delBtn.dataset['timer'] = String(timer);
      }
    });
  });
}

function selectSavedTone(tone: SavedTone): void {
  activeSavedToneId = tone.id;
  customToneValue = tone.description;
  document.querySelectorAll('.tone-btn').forEach((b) => b.classList.remove('active'));
  document.querySelectorAll('.saved-tone-btn').forEach((b) => b.classList.remove('active'));
  document.querySelector<HTMLButtonElement>(`.saved-tone-btn[data-id="${tone.id}"]`)?.classList.add('active');
}

function closeToneCreateForm(): void {
  const form = document.getElementById('tone-create-form');
  if (!form) return;
  form.classList.add('hidden');
  const nameInput = document.getElementById('tone-create-name') as HTMLInputElement | null;
  const descInput = document.getElementById('tone-create-desc') as HTMLTextAreaElement | null;
  const saveBtn = document.getElementById('btn-tone-save') as HTMLButtonElement | null;
  if (nameInput) nameInput.value = '';
  if (descInput) descInput.value = '';
  if (saveBtn) saveBtn.textContent = 'Salvar tom';
  editingToneId = null;
}

function openEditForm(tone: SavedTone): void {
  editingToneId = tone.id;
  const nameInput = document.getElementById('tone-create-name') as HTMLInputElement | null;
  const descInput = document.getElementById('tone-create-desc') as HTMLTextAreaElement | null;
  const saveBtn = document.getElementById('btn-tone-save') as HTMLButtonElement | null;
  if (nameInput) nameInput.value = tone.name;
  if (descInput) descInput.value = tone.description;
  if (saveBtn) saveBtn.textContent = 'Atualizar tom';
  document.getElementById('tone-create-form')?.classList.remove('hidden');
  nameInput?.focus();
  nameInput?.select();
}

// ─── Sincronização e estado ───────────────────────────────────────────────────

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

  // Remove classes de bloqueio adicionadas pelo caminho FREE
  document.querySelectorAll('.tone-btn-pro--locked').forEach((b) => b.classList.remove('tone-btn-pro--locked'));

  // Desbloqueia o botão "Criar tom"
  const addToneBtn = document.getElementById('btn-add-tone');
  if (addToneBtn) {
    const fresh = addToneBtn.cloneNode(true) as HTMLButtonElement;
    fresh.classList.remove('btn-add-tone--locked');
    addToneBtn.replaceWith(fresh);
  }

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

// ─── Inicialização de tons ────────────────────────────────────────────────────

async function initToneSection(): Promise<void> {
  userPlan = await getFromStorage('userPlan') as string | null;

  if (userPlan === 'PRO') {
    // Handlers para tons PRO pré-definidos
    document.querySelectorAll<HTMLButtonElement>('.tone-btn-pro').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tone-btn, .saved-tone-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        selectedTone = btn.dataset['tone'] as ToneOption;
        customToneValue = null;
        activeSavedToneId = null;
        closeToneCreateForm();
      });
    });

    // Tons salvos: carrega e renderiza
    const savedTones = await getSavedTonesFromStorage();
    renderSavedTones(savedTones);

    // Clonar para remover listeners antigos de chamadas anteriores (ex: refreshPlanState)
    ['btn-add-tone', 'btn-tone-cancel', 'btn-tone-save'].forEach((btnId) => {
      const existing = document.getElementById(btnId);
      if (existing) existing.replaceWith(existing.cloneNode(true));
    });

    document.getElementById('btn-add-tone')?.addEventListener('click', () => {
      document.getElementById('tone-create-form')?.classList.remove('hidden');
      (document.getElementById('tone-create-name') as HTMLInputElement | null)?.focus();
    });

    document.getElementById('btn-tone-cancel')?.addEventListener('click', () => {
      closeToneCreateForm();
    });

    document.getElementById('btn-tone-save')?.addEventListener('click', async () => {
      const nameInput = document.getElementById('tone-create-name') as HTMLInputElement;
      const descInput = document.getElementById('tone-create-desc') as HTMLTextAreaElement;
      const name = nameInput.value.trim();
      const description = descInput.value.trim();
      if (!name || !description) return;

      if (editingToneId !== null) {
        const all = await getSavedTonesFromStorage();
        const updated = all.map((t) =>
          t.id === editingToneId ? { ...t, name, description } : t
        );
        const wasActive = activeSavedToneId === editingToneId;
        await setSavedTonesInStorage(updated);
        closeToneCreateForm();
        renderSavedTones(updated);
        if (wasActive) customToneValue = description;
      } else {
        const all = await getSavedTonesFromStorage();
        if (all.length >= 8) return;
        const newTone: SavedTone = { id: `t${Date.now()}`, name, description };
        const updated = [...all, newTone];
        await setSavedTonesInStorage(updated);
        closeToneCreateForm();
        renderSavedTones(updated);
        selectSavedTone(newTone);
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
        chrome.tabs.create({ url: 'https://respondera.com.br/upgrade' });
      });
    });

    // Botão "Criar tom": visível mas bloqueado para FREE — clique abre upgrade
    const addToneBtn = document.getElementById('btn-add-tone') as HTMLButtonElement | null;
    if (addToneBtn) {
      addToneBtn.classList.add('btn-add-tone--locked');
      addToneBtn.addEventListener('click', () => {
        chrome.tabs.create({ url: 'https://respondera.com.br/upgrade' });
      });
    }
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
      document.querySelectorAll('.tone-btn, .saved-tone-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      selectedTone = btn.dataset['tone'] as ToneOption;
      customToneValue = null;
      activeSavedToneId = null;
      closeToneCreateForm();
    });
  });

  // Chips de exemplo — event delegation, adicionado uma vez
  document.getElementById('tone-create-chips')?.addEventListener('click', (e) => {
    const chip = (e.target as Element).closest<HTMLButtonElement>('.tone-chip-example');
    if (!chip) return;
    const descInput = document.getElementById('tone-create-desc') as HTMLTextAreaElement | null;
    if (descInput) {
      descInput.value = chip.dataset['desc'] ?? '';
      descInput.focus();
    }
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
    // Limpa tom personalizado e fecha formulário
    customToneValue = null;
    activeSavedToneId = null;
    getSavedTonesFromStorage().then(renderSavedTones);
    closeToneCreateForm();
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
