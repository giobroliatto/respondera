import { getStorage, setStorage, clearStorage, isLoggedIn } from '../shared/storage';

const BACKEND = BACKEND_URL;

async function init() {
  const loggedIn = await isLoggedIn();
  if (loggedIn) {
    await showHome();
  } else {
    showLogin();
  }
}

function showLogin() {
  document.getElementById('screen-login')!.classList.remove('hidden');
  document.getElementById('screen-home')!.classList.add('hidden');

  document.getElementById('form-login')!.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = (document.getElementById('input-email') as HTMLInputElement).value.trim();
    const password = (document.getElementById('input-password') as HTMLInputElement).value;
    const errEl = document.getElementById('login-error')!;

    errEl.classList.add('hidden');
    errEl.textContent = '';

    try {
      const res = await fetch(`${BACKEND}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Erro ao fazer login.');
      }

      const data = await res.json();

      await setStorage('authToken', data.token);
      await setStorage('userEmail', data.user.email);
      await setStorage('userPlan', data.user.plan);
      await setStorage('usageCount', data.user.usageCount);

      await showHome();
    } catch (err: unknown) {
      errEl.textContent = err instanceof Error ? err.message : 'Erro desconhecido.';
      errEl.classList.remove('hidden');
    }
  });
}

async function showHome() {
  document.getElementById('screen-login')!.classList.add('hidden');
  document.getElementById('screen-home')!.classList.remove('hidden');

  const email = await getStorage('userEmail');
  const plan = await getStorage('userPlan');
  const usage = await getStorage('usageCount');

  document.getElementById('user-email')!.textContent = email ?? '';
  document.getElementById('plan-label')!.textContent = `Plano ${plan ?? 'FREE'}`;
  document.getElementById('usage-label')!.textContent =
    usage !== null ? `${usage} respostas este mês` : '';

  document.getElementById('btn-logout')!.addEventListener('click', async () => {
    await clearStorage();
    showLogin();
  });
}

document.addEventListener('DOMContentLoaded', init);
