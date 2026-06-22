import { getStorage, setStorage, clearStorage, isLoggedIn } from '../shared/storage';
import {
  getMe,
  login as apiLogin,
  register as apiRegister,
  resendVerificationEmail,
  verifyEmailCode,
  getBusiness,
  saveBusiness,
  logout as apiLogout,
  createSubscription,
  getCustomTones,
  clearClientCaches,
} from '../shared/api';
import { AuthResponse, ToneOption, SavedTone } from '../shared/types';

// ─── Transições de tela ───────────────────────────────────────────────────────

async function fadeScreenIn(el: HTMLElement): Promise<void> {
  el.style.transform = 'translateX(28px)';
  el.classList.remove('hidden');
  void el.offsetHeight;
  el.style.transition = 'transform 0.22s cubic-bezier(0.22, 1, 0.36, 1)';
  el.style.transform = '';
  await new Promise<void>(r => setTimeout(r, 240));
  el.style.transition = '';
}

// ─── Init ─────────────────────────────────────────────────────────────────────

async function init(): Promise<void> {
  if (await isLoggedIn()) {
    await showHome();
  } else {
    showLogin();
  }
}

// ─── Tela de login ────────────────────────────────────────────────────────────

function showLogin(): void {
  document.getElementById('screen-loading')!.classList.add('hidden');
  document.getElementById('screen-login')!.classList.add('hidden');
  document.getElementById('screen-register')!.classList.add('hidden');
  document.getElementById('screen-home')!.classList.add('hidden');
  document.getElementById('screen-verify')!.classList.add('hidden');

  document.getElementById('link-to-register')!.onclick = (e) => {
    e.preventDefault();
    showRegister();
  };

  const form = document.getElementById('form-login') as HTMLFormElement;
  const freshForm = form.cloneNode(true) as HTMLFormElement;
  form.replaceWith(freshForm);
  freshForm.reset();

  freshForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email    = (freshForm.querySelector('#input-email') as HTMLInputElement).value.trim();
    const password = (freshForm.querySelector('#input-password') as HTMLInputElement).value;
    const errEl    = document.getElementById('login-error')!;

    errEl.classList.add('hidden');
    errEl.classList.remove('error-visible');
    errEl.textContent = '';

    const btn = freshForm.querySelector('#btn-login') as HTMLButtonElement;
    btn.disabled = true;
    btn.innerHTML = '<svg class="btn-spinner" width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="3" opacity="0.3"/><path d="M21 12A9 9 0 0 0 12 3" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg> Entrando...';

    try {
      const data = await apiLogin(email, password);
      await storeUserData(data);
      if (!data.user.emailVerified) {
        showVerify(data.user.email);
      } else {
        await showHome();
      }
      notifyContentScript();
    } catch (err: unknown) {
      showError(errEl, err instanceof Error ? err.message : 'Erro desconhecido.');
    } finally {
      btn.disabled = false;
      btn.innerHTML = 'Entrar';
    }
  });

  void fadeScreenIn(document.getElementById('screen-login')!);
}

// ─── Tela de registro ─────────────────────────────────────────────────────────

function showRegister(): void {
  document.getElementById('screen-loading')!.classList.add('hidden');
  document.getElementById('screen-login')!.classList.add('hidden');
  document.getElementById('screen-register')!.classList.add('hidden');
  document.getElementById('screen-home')!.classList.add('hidden');
  document.getElementById('screen-verify')!.classList.add('hidden');

  document.getElementById('link-to-login')!.onclick = (e) => {
    e.preventDefault();
    showLogin();
  };

  const form = document.getElementById('form-register') as HTMLFormElement;
  const freshForm = form.cloneNode(true) as HTMLFormElement;
  form.replaceWith(freshForm);

  freshForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email    = (freshForm.querySelector('#input-reg-email') as HTMLInputElement).value.trim();
    const password = (freshForm.querySelector('#input-reg-password') as HTMLInputElement).value;
    const confirm  = (freshForm.querySelector('#input-reg-confirm') as HTMLInputElement).value;
    const errEl    = document.getElementById('register-error')!;

    errEl.classList.add('hidden');
    errEl.classList.remove('error-visible');
    errEl.textContent = '';

    if (password !== confirm) {
      showError(errEl, 'As senhas não coincidem.');
      return;
    }

    if (password.length < 8) {
      showError(errEl, 'A senha deve ter pelo menos 8 caracteres.');
      return;
    }

    const btn = freshForm.querySelector('#btn-register') as HTMLButtonElement;
    btn.disabled = true;
    btn.innerHTML = '<svg class="btn-spinner" width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="3" opacity="0.3"/><path d="M21 12A9 9 0 0 0 12 3" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg> Criando conta...';

    try {
      const data = await apiRegister(email, password);
      await storeUserData({ ...data, user: { ...data.user, usageCount: data.user.usageCount ?? 0 } });
      showVerify(data.user.email);
      notifyContentScript();
    } catch (err: unknown) {
      showError(errEl, err instanceof Error ? err.message : 'Erro desconhecido.');
    } finally {
      btn.disabled = false;
      btn.innerHTML = 'Criar conta';
    }
  });

  void fadeScreenIn(document.getElementById('screen-register')!);
}

// ─── Tela de verificação por código ──────────────────────────────────────────

function showVerify(email: string): void {
  document.getElementById('screen-loading')!.classList.add('hidden');
  document.getElementById('screen-login')!.classList.add('hidden');
  document.getElementById('screen-register')!.classList.add('hidden');
  document.getElementById('screen-home')!.classList.add('hidden');
  const verifyScreen = document.getElementById('screen-verify')!;

  // Preenche e-mail
  (document.getElementById('verify-email-display') as HTMLElement).textContent = email;

  // Reset de estado
  document.getElementById('verify-error')!.classList.add('hidden');
  document.getElementById('verify-error')!.textContent = '';
  document.getElementById('verify-success')!.classList.add('hidden');
  document.getElementById('verify-resend-msg')!.classList.add('hidden');
  const footerEl = document.getElementById('verify-footer') as HTMLElement;
  footerEl.classList.remove('hidden');
  footerEl.style.opacity = '';
  footerEl.style.transform = '';

  // Clona container de inputs para limpar listeners anteriores
  const inputsEl = document.getElementById('code-inputs')!;
  const freshInputsEl = inputsEl.cloneNode(true) as HTMLElement;
  inputsEl.replaceWith(freshInputsEl);
  freshInputsEl.style.opacity = '';
  freshInputsEl.style.transform = '';
  freshInputsEl.style.transition = '';
  const inputs = Array.from(freshInputsEl.querySelectorAll<HTMLInputElement>('.code-input'));
  inputs.forEach(inp => { inp.value = ''; inp.className = 'code-input'; });

  // Clona botão de submit
  const submitOrig = document.getElementById('btn-verify-code') as HTMLButtonElement;
  const submitBtn = submitOrig.cloneNode(true) as HTMLButtonElement;
  submitOrig.replaceWith(submitBtn);
  submitBtn.disabled = true;
  submitBtn.textContent = 'Verificar';
  submitBtn.classList.remove('hidden');
  submitBtn.style.opacity = '';
  submitBtn.style.transform = '';

  // Clona botão de reenvio
  const resendOrig = document.getElementById('btn-verify-resend') as HTMLButtonElement;
  const resendBtn = resendOrig.cloneNode(true) as HTMLButtonElement;
  resendOrig.replaceWith(resendBtn);

  const errEl = document.getElementById('verify-error')!;
  const resendMsg = document.getElementById('verify-resend-msg')!;

  setTimeout(() => inputs[0]?.focus(), 60);

  let isSubmitting = false;

  function updateSubmit(): void {
    submitBtn.disabled = !inputs.every(i => i.value.length === 1);
  }

  function triggerError(msg: string): void {
    errEl.textContent = msg;
    errEl.classList.remove('hidden');
    inputs.forEach(i => {
      i.classList.add('code-error');
      i.value = '';
      i.classList.remove('code-filled');
    });
    inputs[0]?.focus();
    setTimeout(() => inputs.forEach(i => i.classList.remove('code-error')), 420);
    updateSubmit();
  }

  async function doSubmit(): Promise<void> {
    if (isSubmitting) return;
    const code = inputs.map(i => i.value).join('');
    if (code.length !== 6) return;
    isSubmitting = true;
    errEl.classList.add('hidden');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Verificando...';
    try {
      await verifyEmailCode(code);
      await setStorage('emailVerified', true);
      showVerifySuccess();
    } catch (err) {
      triggerError(err instanceof Error ? err.message : 'Código inválido.');
      submitBtn.textContent = 'Verificar';
    } finally {
      isSubmitting = false;
    }
  }

  inputs.forEach((input, i) => {
    input.addEventListener('input', () => {
      input.value = input.value.replace(/\D/g, '').slice(0, 1);
      input.classList.toggle('code-filled', input.value.length > 0);
      if (input.value && i < inputs.length - 1) inputs[i + 1].focus();
      updateSubmit();
      if (inputs.every(inp => inp.value.length === 1)) setTimeout(() => void doSubmit(), 80);
    });

    input.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Backspace' && !input.value && i > 0) {
        e.preventDefault();
        inputs[i - 1].value = '';
        inputs[i - 1].classList.remove('code-filled');
        inputs[i - 1].focus();
        updateSubmit();
      } else if (e.key === 'ArrowLeft' && i > 0) {
        e.preventDefault(); inputs[i - 1].focus();
      } else if (e.key === 'ArrowRight' && i < inputs.length - 1) {
        e.preventDefault(); inputs[i + 1].focus();
      }
    });

    input.addEventListener('paste', (e: ClipboardEvent) => {
      e.preventDefault();
      const pasted = (e.clipboardData?.getData('text') ?? '').replace(/\D/g, '').slice(0, 6);
      inputs.forEach((inp, idx) => {
        inp.value = pasted[idx] ?? '';
        inp.classList.toggle('code-filled', !!pasted[idx]);
      });
      inputs[Math.min(pasted.length, inputs.length - 1)].focus();
      updateSubmit();
      if (pasted.length === 6) setTimeout(() => void doSubmit(), 80);
    });

    input.addEventListener('focus', () => input.select());
  });

  submitBtn.addEventListener('click', () => void doSubmit());

  resendBtn.addEventListener('click', async () => {
    resendBtn.disabled = true;
    resendBtn.textContent = 'Enviando...';
    resendMsg.classList.add('hidden');
    try {
      await resendVerificationEmail();
      resendMsg.textContent = 'Novo código enviado! Verifique seu e-mail.';
      resendMsg.classList.remove('hidden');
      inputs.forEach(i => { i.value = ''; i.className = 'code-input'; });
      inputs[0]?.focus();
      updateSubmit();
    } catch (e) {
      resendMsg.textContent = e instanceof Error ? e.message : 'Erro ao reenviar.';
      resendMsg.classList.remove('hidden');
    } finally {
      resendBtn.disabled = false;
      resendBtn.textContent = 'Reenviar código';
    }
  });

  void fadeScreenIn(verifyScreen);
}

function showVerifySuccess(): void {
  const verifyScreen = document.getElementById('screen-verify')!;
  const inputsEl  = document.getElementById('code-inputs') as HTMLElement;
  const submitBtn = document.getElementById('btn-verify-code') as HTMLElement;
  const footerEl  = document.getElementById('verify-footer') as HTMLElement;
  const errEl     = document.getElementById('verify-error')!;
  const successEl = document.getElementById('verify-success')!;

  errEl.classList.add('hidden');

  const fadeOut = (el: HTMLElement) => {
    el.style.transition = 'opacity 0.18s, transform 0.18s';
    el.style.opacity = '0';
    el.style.transform = 'scale(0.95)';
  };
  fadeOut(inputsEl);
  fadeOut(submitBtn);
  fadeOut(footerEl);

  setTimeout(() => {
    inputsEl.classList.add('hidden');
    submitBtn.classList.add('hidden');
    footerEl.classList.add('hidden');
    successEl.classList.remove('hidden');

    // Aguarda a animação do checkmark e sai suavemente
    setTimeout(() => {
      verifyScreen.style.transition = 'opacity 0.3s, transform 0.3s';
      verifyScreen.style.opacity = '0';
      verifyScreen.style.transform = 'translateY(-8px) scale(0.97)';
      setTimeout(() => void showHome(), 300);
    }, 1600);
  }, 200);
}

// ─── Tela logado ──────────────────────────────────────────────────────────────

async function showHome(): Promise<void> {
  // Mantém loading visível enquanto sincroniza
  document.getElementById('screen-login')!.classList.add('hidden');
  document.getElementById('screen-register')!.classList.add('hidden');
  document.getElementById('screen-verify')!.classList.add('hidden');

  try {
    const user = await getMe();
    await setStorage('userPlan', user.plan);
    await setStorage('usageCount', user.usageCount);
    await setStorage('emailVerified', user.emailVerified);
    await setStorage('renewalDate', (user as any).nextBillingDate ?? null);
    await setStorage('subscriptionStatus', (user as any).subscriptionStatus ?? null);

    if (!user.emailVerified) {
      showVerify(user.email);
      return;
    }
  } catch {
    // Sessão expirada ou offline — verifica cache
    if (!(await isLoggedIn())) {
      showLogin();
      return;
    }
    const cachedVerified = await getStorage('emailVerified');
    if (!cachedVerified) {
      const cachedEmail = (await getStorage('userEmail')) ?? '';
      showVerify(cachedEmail);
      return;
    }
  }

  const email              = await getStorage('userEmail');
  const plan               = await getStorage('userPlan');
  const usage              = await getStorage('usageCount');
  const renewalDate        = await getStorage('renewalDate');
  const subscriptionStatus = await getStorage('subscriptionStatus');

  document.getElementById('user-email')!.textContent = email ?? '';

  const renewalEl = document.getElementById('renewal-label')!;
  renewalEl.classList.add('hidden');
  if (plan === 'PRO') {
    document.getElementById('plan-label')!.textContent = 'Plano PRO';
    document.getElementById('upgrade-banner')!.classList.add('hidden');
    if (renewalDate) {
      const date = new Date(renewalDate as string);
      const formatted = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
      const isPaused = subscriptionStatus === 'paused';
      document.getElementById('usage-label')!.textContent = isPaused
        ? `Acesso até ${formatted}`
        : `Renova em ${formatted}`;
    } else {
      document.getElementById('usage-label')!.textContent = '';
    }
  } else {
    document.getElementById('plan-label')!.textContent = 'Plano FREE';
    document.getElementById('usage-label')!.textContent =
      usage !== null ? `${usage} de 10 respostas este mês` : '';
    document.getElementById('upgrade-banner')!.classList.remove('hidden');
  }

  bindUpgradeButton();
  bindTabs(plan === 'PRO');

  const btnLogout = document.getElementById('btn-logout')!;
  const freshBtn = btnLogout.cloneNode(true) as HTMLButtonElement;
  btnLogout.replaceWith(freshBtn);

  freshBtn.disabled = false;
  freshBtn.textContent = 'Logout';

  freshBtn.addEventListener('click', async () => {
    freshBtn.disabled = true;
    freshBtn.innerHTML = '<svg class="btn-spinner" width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="3" opacity="0.3"/><path d="M21 12A9 9 0 0 0 12 3" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg> Saindo...';
    await apiLogout();
    await clearStorage();
    await clearClientCaches();
    showLogin();
  });

  // Sempre inicia na aba "Início"
  document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('tab-active'));
  document.getElementById('tab-home')!.classList.add('tab-active');
  document.getElementById('tab-panel-home')!.classList.remove('hidden');
  document.getElementById('tab-panel-business')!.classList.add('hidden');

  document.getElementById('screen-loading')!.classList.add('hidden');
  void fadeScreenIn(document.getElementById('screen-home')!);

  getBusiness()
    .then(business => { if (business?.tone) setStorage('defaultTone', business.tone); })
    .catch(() => {});
}

// ─── Abas ─────────────────────────────────────────────────────────────────

function showError(el: HTMLElement, message: string): void {
  el.textContent = message;
  el.classList.remove('error-visible');
  el.classList.remove('hidden');
  void el.offsetHeight;
  el.classList.add('error-visible');
}

function slidePanel(el: HTMLElement, direction: 'left' | 'right'): void {
  el.style.transform = `translateX(${direction === 'right' ? '28px' : '-28px'})`;
  el.classList.remove('hidden');
  void el.offsetHeight;
  el.style.transition = 'transform 0.22s cubic-bezier(0.22, 1, 0.36, 1)';
  el.style.transform = '';
  setTimeout(() => { el.style.transition = ''; }, 240);
}

function bindTabs(isPro: boolean): void {
  document.querySelectorAll<HTMLButtonElement>('.tab-btn').forEach((btn) => {
    const freshBtn = btn.cloneNode(true) as HTMLButtonElement;
    btn.replaceWith(freshBtn);
    freshBtn.addEventListener('click', () => {
      if (freshBtn.classList.contains('tab-active')) return;
      const toBusiness = freshBtn.dataset['tab'] === 'tab-panel-business';
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('tab-active'));
      freshBtn.classList.add('tab-active');
      document.getElementById('tab-indicator')?.classList.toggle('at-business', toBusiness);
      const panelHome = document.getElementById('tab-panel-home')!;
      const panelBusiness = document.getElementById('tab-panel-business')!;
      if (toBusiness) {
        panelHome.classList.add('hidden');
        slidePanel(panelBusiness, 'right');
        loadBusinessForm(isPro);
      } else {
        panelBusiness.classList.add('hidden');
        slidePanel(panelHome, 'left');
      }
    });
  });
}

// ─── Formulário Meu Negócio ───────────────────────────────────────────────

let _soloOperator = false;
let _soloGender: 'M' | 'F' = 'M';
let _bizTone: ToneOption = 'friendly';
let _bizDefaultCustomToneId: string | null = null;

async function getSavedTonesSync(): Promise<SavedTone[]> {
  try {
    return await getCustomTones();
  } catch {
    return new Promise((resolve) => {
      chrome.storage.local.get('savedCustomTones', (result) => {
        resolve((result['savedCustomTones'] as SavedTone[]) ?? []);
      });
    });
  }
}

function renderBizSavedTones(tones: SavedTone[]): void {
  const container = document.getElementById('biz-saved-tones');
  if (!container) return;
  container.innerHTML = '';

  if (tones.length === 0) {
    const hint = document.createElement('span');
    hint.className = 'biz-saved-tones-empty';
    hint.textContent = 'Crie tons personalizados no painel lateral';
    container.appendChild(hint);
    return;
  }

  tones.forEach((tone) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'biz-saved-tone-btn' + (tone.id === _bizDefaultCustomToneId ? ' biz-tone-active' : '');
    btn.dataset['id'] = tone.id;
    btn.textContent = tone.name;
    btn.title = tone.description;
    container.appendChild(btn);

    btn.addEventListener('click', () => {
      _bizTone = 'custom';
      _bizDefaultCustomToneId = tone.id;
      document.querySelectorAll<HTMLButtonElement>('#biz-tone-grid .biz-tone-btn').forEach((b) =>
        b.classList.remove('biz-tone-active')
      );
      document.querySelectorAll<HTMLButtonElement>('.biz-saved-tone-btn').forEach((b) =>
        b.classList.toggle('biz-tone-active', b.dataset['id'] === tone.id)
      );
    });
  });
}

async function loadBusinessForm(isPro: boolean): Promise<void> {
  const lockEl = document.getElementById('business-pro-lock')!;
  const formEl = document.getElementById('form-business')!;
  if (!isPro) {
    lockEl.classList.remove('hidden');
    formEl.classList.add('fields-locked');
  } else {
    lockEl.classList.add('hidden');
    formEl.classList.remove('fields-locked');
  }

  (document.getElementById('biz-name') as HTMLInputElement).value = '';
  (document.getElementById('biz-segment') as HTMLInputElement).value = '';
  (document.getElementById('biz-ticket') as HTMLInputElement).value = '';
  const highlightsEl0 = document.getElementById('biz-highlights') as HTMLTextAreaElement;
  highlightsEl0.value = '';
  document.getElementById('biz-highlights-count')!.textContent = '0/200';
  _soloOperator = false;
  _soloGender = 'M';
  _bizTone = 'friendly';
  _bizDefaultCustomToneId = null;
  updateVoiceToggle(false);
  updateGenderToggle('M');
  updateToneToggle('friendly');

  try {
    const business = await getBusiness();
    if (business) {
      (document.getElementById('biz-name') as HTMLInputElement).value = business.name ?? '';
      (document.getElementById('biz-segment') as HTMLInputElement).value = business.segment ?? '';
      (document.getElementById('biz-ticket') as HTMLInputElement).value = (business as any).avgTicket ?? '';
      const highlightsEl = document.getElementById('biz-highlights') as HTMLTextAreaElement;
      highlightsEl.value = (business as any).highlights ?? '';
      document.getElementById('biz-highlights-count')!.textContent = `${highlightsEl.value.length}/200`;
      _soloOperator = Boolean((business as any).soloOperator);
      _soloGender = (business as any).soloGender === 'F' ? 'F' : 'M';
      _bizTone = ((business as any).tone || 'friendly') as ToneOption;
      _bizDefaultCustomToneId = (business as any).defaultCustomToneId ?? null;
      updateVoiceToggle(_soloOperator);
      updateGenderToggle(_soloGender);
      updateToneToggle(_bizTone);
    }
  } catch {
    // silencioso
  }

  bindBusinessForm(isPro);

  const savedTones = await getSavedTonesSync();
  renderBizSavedTones(savedTones);
}

function updateVoiceToggle(isSolo: boolean): void {
  document.querySelectorAll<HTMLButtonElement>('#biz-voice-toggle .toggle-btn').forEach((btn) => {
    const isSoloBtn = btn.dataset['value'] === 'solo';
    btn.classList.toggle('toggle-active', isSolo ? isSoloBtn : !isSoloBtn);
  });
  const genderRow = document.getElementById('biz-gender-row')!;
  genderRow.classList.toggle('hidden', !isSolo);
  const hint = document.getElementById('biz-voice-hint')!;
  hint.textContent = isSolo
    ? 'A IA vai usar "fico", "agradeço", "atendo"…'
    : 'A IA vai usar "ficamos", "agradecemos"…';
}

function updateGenderToggle(gender: 'M' | 'F'): void {
  document.querySelectorAll<HTMLButtonElement>('.gender-btn').forEach((btn) => {
    btn.classList.toggle('gender-active', btn.dataset['value'] === gender);
  });
}

function updateToneToggle(tone: string): void {
  document.querySelectorAll<HTMLButtonElement>('#biz-tone-grid .biz-tone-btn').forEach((btn) => {
    btn.classList.toggle('biz-tone-active', btn.dataset['value'] === tone);
  });
  if (tone !== 'custom') {
    document.querySelectorAll('.biz-saved-tone-btn').forEach((b) => b.classList.remove('biz-tone-active'));
  }
}

function bindBusinessForm(isPro: boolean): void {
  const form = document.getElementById('form-business') as HTMLFormElement;
  const freshForm = form.cloneNode(true) as HTMLFormElement;
  form.replaceWith(freshForm);

  const highlightsEl = freshForm.querySelector('#biz-highlights') as HTMLTextAreaElement;
  const countEl = freshForm.querySelector('#biz-highlights-count')!;
  highlightsEl.addEventListener('input', () => {
    countEl.textContent = `${highlightsEl.value.length}/200`;
  });

  freshForm.querySelectorAll<HTMLButtonElement>('#biz-voice-toggle .toggle-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!isPro) return;
      _soloOperator = btn.dataset['value'] === 'solo';
      updateVoiceToggle(_soloOperator);
    });
  });

  freshForm.querySelectorAll<HTMLButtonElement>('.gender-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!isPro) return;
      _soloGender = btn.dataset['value'] as 'M' | 'F';
      updateGenderToggle(_soloGender);
    });
  });

  freshForm.querySelectorAll<HTMLButtonElement>('.biz-tone-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!isPro) return;
      _bizTone = btn.dataset['value'] as ToneOption;
      _bizDefaultCustomToneId = null;
      updateToneToggle(_bizTone);
    });
  });

  if (!isPro) return;

  freshForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name       = (freshForm.querySelector('#biz-name') as HTMLInputElement).value.trim();
    const segment    = (freshForm.querySelector('#biz-segment') as HTMLInputElement).value.trim();
    const ticket     = (freshForm.querySelector('#biz-ticket') as HTMLInputElement).value.trim();
    const highlights = highlightsEl.value.trim();
    const feedback   = document.getElementById('business-feedback')!;
    const btn        = freshForm.querySelector('#btn-save-business') as HTMLButtonElement;

    feedback.className = 'feedback hidden';

    if (!name || !segment) {
      feedback.textContent = 'Nome e segmento são obrigatórios.';
      feedback.className = 'feedback error';
      return;
    }

    btn.disabled = true;
    btn.innerHTML = '<svg class="btn-spinner" width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="3" opacity="0.3"/><path d="M21 12A9 9 0 0 0 12 3" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg> Salvando...';

    try {
      await saveBusiness({
        name,
        segment,
        tone: _bizTone,
        avgTicket: ticket || null,
        highlights: highlights || null,
        soloOperator: _soloOperator,
        soloGender: _soloOperator ? _soloGender : null,
        defaultCustomToneId: _bizTone === 'custom' ? _bizDefaultCustomToneId : null,
      });
      await setStorage('defaultTone', _bizTone);
      feedback.textContent = 'Contexto salvo!';
      feedback.className = 'feedback success';
    } catch (err) {
      feedback.textContent = err instanceof Error ? err.message : 'Erro ao salvar. Tente novamente.';
      feedback.className = 'feedback error';
    } finally {
      btn.disabled = false;
      btn.innerHTML = 'Salvar';
    }
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function storeUserData(data: AuthResponse): Promise<void> {
  await clearClientCaches();
  await setStorage('authToken',  data.token);
  await setStorage('userEmail',  data.user.email);
  await setStorage('userPlan',   data.user.plan);
  await setStorage('usageCount', data.user.usageCount);
  await setStorage('emailVerified', data.user.emailVerified);
  await setStorage('renewalDate', (data.user as any).nextBillingDate ?? null);
  await setStorage('subscriptionStatus', (data.user as any).subscriptionStatus ?? null);
}

function bindUpgradeButton(): void {
  const btn = document.getElementById('btn-upgrade') as HTMLButtonElement;
  if (!btn) return;
  const fresh = btn.cloneNode(true) as HTMLButtonElement;
  btn.replaceWith(fresh);

  fresh.addEventListener('click', async () => {
    fresh.disabled = true;
    fresh.textContent = 'Aguarde...';
    try {
      const { checkoutUrl } = await createSubscription();
      chrome.tabs.create({ url: checkoutUrl });
    } catch {
      chrome.tabs.create({ url: 'https://respondera.com.br/pro' });
    } finally {
      fresh.disabled = false;
      fresh.textContent = 'Assinar PRO';
    }
  });
}

function notifyContentScript(): void {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]?.id) {
      chrome.tabs.sendMessage(tabs[0].id, { type: 'RESPONDERA_LOGGED_IN' });
    }
  });
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', init);
