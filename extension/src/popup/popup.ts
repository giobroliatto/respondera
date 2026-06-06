import { getStorage, setStorage, clearStorage, isLoggedIn } from '../shared/storage';
import {
  getMe,
  login as apiLogin,
  register as apiRegister,
  resendVerificationEmail,
  getBusiness,
  saveBusiness,
} from '../shared/api';
import { AuthResponse } from '../shared/types';

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
      notifyContentScript();
      await showHome();
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

    if (password.length < 6) {
      errEl.textContent = 'A senha deve ter pelo menos 6 caracteres.';
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
      notifyContentScript();
      await showHome();
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
  document.getElementById('screen-login')!.classList.add('hidden');
  document.getElementById('screen-register')!.classList.add('hidden');
  document.getElementById('screen-home')!.classList.remove('hidden');

  const email = await getStorage('userEmail');
  const plan  = await getStorage('userPlan');
  const usage = await getStorage('usageCount');
  const emailVerified = await getStorage('emailVerified');

  document.getElementById('user-email')!.textContent = email ?? '';
  renderVerificationBox(Boolean(emailVerified));

  if (plan === 'PRO') {
    document.getElementById('plan-label')!.textContent = 'Plano PRO';
    document.getElementById('usage-label')!.textContent = '';
  } else {
    document.getElementById('plan-label')!.textContent = 'Plano FREE';
    document.getElementById('usage-label')!.textContent =
      usage !== null ? `${usage} de 10 respostas este mês` : '';
  }

  // Abas PRO
  if (plan === 'PRO') {
    document.getElementById('tabs')!.classList.remove('hidden');
    bindTabs();
  }

  const btnLogout = document.getElementById('btn-logout')!;
  const freshBtn = btnLogout.cloneNode(true) as HTMLButtonElement;
  btnLogout.replaceWith(freshBtn);

  freshBtn.addEventListener('click', async () => {
    await clearStorage();
    showLogin();
  });

  bindVerificationActions();
}

// ─── Abas ─────────────────────────────────────────────────────────────────

function bindTabs(): void {
  document.querySelectorAll<HTMLButtonElement>('.tab-btn').forEach((btn) => {
    const freshBtn = btn.cloneNode(true) as HTMLButtonElement;
    btn.replaceWith(freshBtn);
    freshBtn.addEventListener('click', () => {
      // Ativa aba clicada
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('tab-active'));
      freshBtn.classList.add('tab-active');
      // Mostra painel correspondente
      const targetId = freshBtn.dataset['tab']!;
      document.getElementById('tab-panel-home')!.classList.toggle('hidden', targetId !== 'tab-panel-home');
      document.getElementById('tab-panel-business')!.classList.toggle('hidden', targetId !== 'tab-panel-business');
      // Carrega dados ao entrar na aba do negócio
      if (targetId === 'tab-panel-business') loadBusinessForm();
    });
  });
}

// ─── Formulário Meu Negócio ───────────────────────────────────────────────

async function loadBusinessForm(): Promise<void> {
  try {
    const business = await getBusiness();
    if (business) {
      (document.getElementById('biz-name') as HTMLInputElement).value = business.name ?? '';
      (document.getElementById('biz-segment') as HTMLInputElement).value = business.segment ?? '';
      (document.getElementById('biz-ticket') as HTMLInputElement).value = business.avgTicket ?? '';
      const highlightsEl = document.getElementById('biz-highlights') as HTMLTextAreaElement;
      highlightsEl.value = business.highlights ?? '';
      document.getElementById('biz-highlights-count')!.textContent = `${highlightsEl.value.length}/200`;
    }
  } catch {
    // silencioso — formulário fica em branco se não houver negócio cadastrado
  }
  bindBusinessForm();
}

function bindBusinessForm(): void {
  const form = document.getElementById('form-business') as HTMLFormElement;
  const freshForm = form.cloneNode(true) as HTMLFormElement;
  form.replaceWith(freshForm);

  // Contador de caracteres dos diferenciais
  const highlightsEl = freshForm.querySelector('#biz-highlights') as HTMLTextAreaElement;
  const countEl = freshForm.querySelector('#biz-highlights-count')!;
  highlightsEl.addEventListener('input', () => {
    countEl.textContent = `${highlightsEl.value.length}/200`;
  });

  freshForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name     = (freshForm.querySelector('#biz-name') as HTMLInputElement).value.trim();
    const segment  = (freshForm.querySelector('#biz-segment') as HTMLInputElement).value.trim();
    const ticket   = (freshForm.querySelector('#biz-ticket') as HTMLInputElement).value.trim();
    const highlights = highlightsEl.value.trim();
    const feedback = document.getElementById('business-feedback')!;
    const btn      = freshForm.querySelector('#btn-save-business') as HTMLButtonElement;

    feedback.classList.add('hidden');
    feedback.className = 'feedback hidden';

    if (!name || !segment) {
      feedback.textContent = 'Nome e segmento são obrigatórios.';
      feedback.classList.remove('hidden');
      feedback.classList.add('error');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Salvando...';

    try {
      await saveBusiness({
        name,
        segment,
        tone: 'friendly',
        avgTicket: ticket || null,
        highlights: highlights || null,
      });
      feedback.textContent = 'Contexto salvo! Suas próximas respostas serão personalizadas.';
      feedback.classList.remove('hidden');
      feedback.classList.add('success');
    } catch (err) {
      feedback.textContent = err instanceof Error ? err.message : 'Erro ao salvar. Tente novamente.';
      feedback.classList.remove('hidden');
      feedback.classList.add('error');
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

function notifyContentScript(): void {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]?.id) {
      chrome.tabs.sendMessage(tabs[0].id, { type: 'RESPONDERA_LOGGED_IN' });
    }
  });
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', init);

