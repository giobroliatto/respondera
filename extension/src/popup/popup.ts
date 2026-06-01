import { getStorage, setStorage, clearStorage, isLoggedIn } from '../shared/storage';
import { login as apiLogin, register as apiRegister } from '../shared/api';
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

  document.getElementById('user-email')!.textContent = email ?? '';

  if (plan === 'PRO') {
    document.getElementById('plan-label')!.textContent = 'Plano PRO';
    document.getElementById('usage-label')!.textContent = '';
  } else {
    document.getElementById('plan-label')!.textContent = 'Plano FREE';
    document.getElementById('usage-label')!.textContent =
      usage !== null ? `${usage} de 10 respostas este mês` : '';
  }

  const btnLogout = document.getElementById('btn-logout')!;
  const freshBtn = btnLogout.cloneNode(true) as HTMLButtonElement;
  btnLogout.replaceWith(freshBtn);

  freshBtn.addEventListener('click', async () => {
    await clearStorage();
    showLogin();
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function storeUserData(data: AuthResponse): Promise<void> {
  await setStorage('authToken',  data.token);
  await setStorage('userEmail',  data.user.email);
  await setStorage('userPlan',   data.user.plan);
  await setStorage('usageCount', data.user.usageCount);
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

