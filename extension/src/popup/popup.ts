import { getStorage, setStorage, clearStorage, isLoggedIn } from '../shared/storage';
import {
  getMe,
  login as apiLogin,
  register as apiRegister,
  resendVerificationEmail,
  getBusiness,
  saveBusiness,
  logout as apiLogout,
  createSubscription,
} from '../shared/api';
import { AuthResponse, ToneOption } from '../shared/types';

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
  document.getElementById('screen-login')!.classList.remove('hidden');
  document.getElementById('screen-register')!.classList.add('hidden');
  document.getElementById('screen-home')!.classList.add('hidden');

  document.getElementById('link-to-register')!.onclick = (e) => {
    e.preventDefault();
    showRegister();
  };

  const form = document.getElementById('form-login') as HTMLFormElement;
  // Remove handlers anteriores clonando o formulário
  const freshForm = form.cloneNode(true) as HTMLFormElement;
  form.replaceWith(freshForm);

  freshForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email    = (freshForm.querySelector('#input-email') as HTMLInputElement).value.trim();
    const password = (freshForm.querySelector('#input-password') as HTMLInputElement).value;
    const errEl    = document.getElementById('login-error')!;

    errEl.classList.add('hidden');
    errEl.textContent = '';

    const btn = freshForm.querySelector('#btn-login') as HTMLButtonElement;
    btn.disabled = true;
    btn.textContent = 'Entrando...';

    try {
      const data = await apiLogin(email, password);
      await storeUserData(data);
      await showHome();
      notifyContentScript();
    } catch (err: unknown) {
      errEl.textContent = err instanceof Error ? err.message : 'Erro desconhecido.';
      errEl.classList.remove('hidden');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Entrar';
    }
  });
}

// ─── Tela de registro ─────────────────────────────────────────────────────────

function showRegister(): void {
  document.getElementById('screen-loading')!.classList.add('hidden');
  document.getElementById('screen-login')!.classList.add('hidden');
  document.getElementById('screen-register')!.classList.remove('hidden');
  document.getElementById('screen-home')!.classList.add('hidden');

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
    errEl.textContent = '';

    if (password !== confirm) {
      errEl.textContent = 'As senhas não coincidem.';
      errEl.classList.remove('hidden');
      return;
    }

    if (password.length < 8) {
      errEl.textContent = 'A senha deve ter pelo menos 8 caracteres.';
      errEl.classList.remove('hidden');
      return;
    }

    const btn = freshForm.querySelector('#btn-register') as HTMLButtonElement;
    btn.disabled = true;
    btn.textContent = 'Criando conta...';

    try {
      const data = await apiRegister(email, password);
      // Registro não retorna usageCount; começa em 0
      await storeUserData({ ...data, user: { ...data.user, usageCount: data.user.usageCount ?? 0 } });
      await showHome();
      notifyContentScript();
    } catch (err: unknown) {
      errEl.textContent = err instanceof Error ? err.message : 'Erro desconhecido.';
      errEl.classList.remove('hidden');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Criar conta';
    }
  });
}

// ─── Tela logado ──────────────────────────────────────────────────────────────

async function showHome(): Promise<void> {
  // Mantém loading visível enquanto sincroniza e carrega os dados
  document.getElementById('screen-login')!.classList.add('hidden');
  document.getElementById('screen-register')!.classList.add('hidden');

  // Sincroniza com o servidor para pegar plano/uso atualizados (ex: auto-downgrade)
  try {
    const user = await getMe();
    await setStorage('userPlan', user.plan);
    await setStorage('usageCount', user.usageCount);
    await setStorage('emailVerified', user.emailVerified);
    await setStorage('renewalDate', (user as any).mpNextBillingDate ?? null);
    await setStorage('subscriptionStatus', (user as any).mpSubscriptionStatus ?? null);
  } catch {
    // Offline ou token expirado — usa cache local
  }

  const email             = await getStorage('userEmail');
  const plan              = await getStorage('userPlan');
  const usage             = await getStorage('usageCount');
  const emailVerified     = await getStorage('emailVerified');
  const renewalDate       = await getStorage('renewalDate');
  const subscriptionStatus = await getStorage('subscriptionStatus');

  document.getElementById('user-email')!.textContent = email ?? '';
  renderVerificationBox(Boolean(emailVerified));

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

  // Abas visíveis para todos; painel bloqueado para FREE
  bindTabs(plan === 'PRO');

  const btnLogout = document.getElementById('btn-logout')!;
  const freshBtn = btnLogout.cloneNode(true) as HTMLButtonElement;
  btnLogout.replaceWith(freshBtn);

  freshBtn.addEventListener('click', async () => {
    await apiLogout();   // invalida o token no servidor
    await clearStorage();
    showLogin();
  });

  bindVerificationActions();

  // Tudo pronto: esconde loading e mostra a tela home
  document.getElementById('screen-loading')!.classList.add('hidden');
  document.getElementById('screen-home')!.classList.remove('hidden');

  // Repopula defaultTone no storage em background (necessário após logout/login,
  // já que clearStorage() apaga tudo e storeUserData não salva o tom).
  getBusiness()
    .then(business => { if (business?.tone) setStorage('defaultTone', business.tone); })
    .catch(() => {});
}

// ─── Abas ─────────────────────────────────────────────────────────────────

function bindTabs(isPro: boolean): void {
  document.querySelectorAll<HTMLButtonElement>('.tab-btn').forEach((btn) => {
    const freshBtn = btn.cloneNode(true) as HTMLButtonElement;
    btn.replaceWith(freshBtn);
    freshBtn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('tab-active'));
      freshBtn.classList.add('tab-active');
      const targetId = freshBtn.dataset['tab']!;
      document.getElementById('tab-panel-home')!.classList.toggle('hidden', targetId !== 'tab-panel-home');
      document.getElementById('tab-panel-business')!.classList.toggle('hidden', targetId !== 'tab-panel-business');
      if (targetId === 'tab-panel-business') loadBusinessForm(isPro);
    });
  });
}

// ─── Formulário Meu Negócio ───────────────────────────────────────────────

let _soloOperator = false;
let _soloGender: 'M' | 'F' = 'M';
let _bizTone: ToneOption = 'friendly';

async function loadBusinessForm(isPro: boolean): Promise<void> {
  // Lock visual para FREE
  const lockEl = document.getElementById('business-pro-lock')!;
  const formEl = document.getElementById('form-business')!;
  if (!isPro) {
    lockEl.classList.remove('hidden');
    formEl.classList.add('fields-locked');
  } else {
    lockEl.classList.add('hidden');
    formEl.classList.remove('fields-locked');
  }

  try {
    const business = await getBusiness();
    if (business) {
      (document.getElementById('biz-name') as HTMLInputElement).value = business.name ?? '';
      (document.getElementById('biz-segment') as HTMLInputElement).value = business.segment ?? '';
      (document.getElementById('biz-ticket') as HTMLInputElement).value = (business as any).avgTicket ?? '';
      const highlightsEl = document.getElementById('biz-highlights') as HTMLTextAreaElement;
      highlightsEl.value = (business as any).highlights ?? '';
      document.getElementById('biz-highlights-count')!.textContent = `${highlightsEl.value.length}/200`;
      // Restaura toggle de voz e gênero
      _soloOperator = Boolean((business as any).soloOperator);
      _soloGender = (business as any).soloGender === 'F' ? 'F' : 'M';
      _bizTone = ((business as any).tone || 'friendly') as ToneOption;
      updateVoiceToggle(_soloOperator);
      updateGenderToggle(_soloGender);
      updateToneToggle(_bizTone);
    }
  } catch {
    // silencioso — formulário fica em branco se não houver negócio cadastrado
  }

  bindBusinessForm(isPro);
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
}

function bindBusinessForm(isPro: boolean): void {
  const form = document.getElementById('form-business') as HTMLFormElement;
  const freshForm = form.cloneNode(true) as HTMLFormElement;
  form.replaceWith(freshForm);

  // Contador de caracteres
  const highlightsEl = freshForm.querySelector('#biz-highlights') as HTMLTextAreaElement;
  const countEl = freshForm.querySelector('#biz-highlights-count')!;
  highlightsEl.addEventListener('input', () => {
    countEl.textContent = `${highlightsEl.value.length}/200`;
  });

  // Toggle solo/empresa
  freshForm.querySelectorAll<HTMLButtonElement>('#biz-voice-toggle .toggle-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!isPro) return;
      _soloOperator = btn.dataset['value'] === 'solo';
      updateVoiceToggle(_soloOperator);
    });
  });

  // Toggle masculino/feminino
  freshForm.querySelectorAll<HTMLButtonElement>('.gender-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!isPro) return;
      _soloGender = btn.dataset['value'] as 'M' | 'F';
      updateGenderToggle(_soloGender);
    });
  });

  // Seletor de tom padrão
  freshForm.querySelectorAll<HTMLButtonElement>('.biz-tone-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!isPro) return;
      _bizTone = btn.dataset['value'] as ToneOption;
      updateToneToggle(_bizTone);
    });
  });

  if (!isPro) return; // FREE não submete

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
    btn.textContent = 'Salvando...';

    try {
      await saveBusiness({
        name,
        segment,
        tone: _bizTone,
        avgTicket: ticket || null,
        highlights: highlights || null,
        soloOperator: _soloOperator,
        soloGender: _soloOperator ? _soloGender : null,
      });
      await setStorage('defaultTone', _bizTone);
      feedback.textContent = 'Contexto salvo!';
      feedback.className = 'feedback success';
    } catch (err) {
      feedback.textContent = err instanceof Error ? err.message : 'Erro ao salvar. Tente novamente.';
      feedback.className = 'feedback error';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Salvar';
    }
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function storeUserData(data: AuthResponse): Promise<void> {
  await setStorage('authToken',  data.token);
  await setStorage('userEmail',  data.user.email);
  await setStorage('userPlan',   data.user.plan);
  await setStorage('usageCount', data.user.usageCount);
  await setStorage('emailVerified', data.user.emailVerified);
  await setStorage('renewalDate', (data.user as any).mpNextBillingDate ?? null);
  await setStorage('subscriptionStatus', (data.user as any).mpSubscriptionStatus ?? null);
}

function setVerificationMessage(message: string, isError = false): void {
  const msg = document.getElementById('verification-message')!;
  msg.textContent = message;
  msg.classList.remove('hidden');
  msg.style.color = isError ? 'var(--red)' : 'var(--text)';
}

function renderVerificationBox(emailVerified: boolean): void {
  const box = document.getElementById('email-verification-box')!;
  const msg = document.getElementById('verification-message')!;
  msg.classList.add('hidden');
  msg.textContent = '';
  box.classList.toggle('hidden', emailVerified);
}

function bindVerificationActions(): void {
  const resendBtn = document.getElementById('btn-resend-verification') as HTMLButtonElement;
  const refreshBtn = document.getElementById('btn-refresh-verification') as HTMLButtonElement;

  const freshResend = resendBtn.cloneNode(true) as HTMLButtonElement;
  const freshRefresh = refreshBtn.cloneNode(true) as HTMLButtonElement;
  resendBtn.replaceWith(freshResend);
  refreshBtn.replaceWith(freshRefresh);

  freshResend.addEventListener('click', async () => {
    freshResend.disabled = true;
    freshResend.textContent = 'Enviando...';

    try {
      const result = await resendVerificationEmail();
      await setStorage('emailVerified', result.emailVerified);
      renderVerificationBox(result.emailVerified);
      if (!result.emailVerified) setVerificationMessage(result.message);
    } catch (err) {
      setVerificationMessage(err instanceof Error ? err.message : 'Erro ao reenviar e-mail.', true);
    } finally {
      freshResend.disabled = false;
      freshResend.textContent = 'Reenviar e-mail';
    }
  });

  freshRefresh.addEventListener('click', async () => {
    freshRefresh.disabled = true;
    freshRefresh.textContent = 'Checando...';

    try {
      const user = await getMe();
      await setStorage('userPlan', user.plan);
      await setStorage('usageCount', user.usageCount);
      await setStorage('emailVerified', user.emailVerified);
      await setStorage('renewalDate', (user as any).mpNextBillingDate ?? null);
      renderVerificationBox(user.emailVerified);
      if (!user.emailVerified) {
        setVerificationMessage('E-mail ainda não confirmado.');
      } else {
        await showHome();
      }
    } catch (err) {
      setVerificationMessage(err instanceof Error ? err.message : 'Erro ao atualizar status.', true);
    } finally {
      freshRefresh.disabled = false;
      freshRefresh.textContent = 'Atualizar';
    }
  });
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
    } catch (err) {
      // Fallback: abre a landing page de upgrade
      chrome.tabs.create({ url: 'https://respondera.com.br/upgrade' });
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

