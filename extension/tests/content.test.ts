// Roda o content script de verdade sobre a página de mock (mock/mock-reviews.html),
// que imita a tela de avaliações do Google Perfil de Empresas.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';

const TOTAL_REVIEWS = 32;

function loadMockPage(): void {
  const html = readFileSync(resolve(__dirname, '../mock/mock-reviews.html'), 'utf8');
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const scripts = Array.from(doc.querySelectorAll('script')).map((s) => s.textContent ?? '');
  doc.querySelectorAll('script').forEach((s) => s.remove());

  document.head.innerHTML = doc.head.innerHTML;
  document.body.innerHTML = doc.body.innerHTML;
  // eval indireto: executa no escopo global, como uma <script> da página
  scripts.forEach((code) => (0, eval)(code));
}

function card(id: string): HTMLElement {
  return document.querySelector<HTMLElement>(`[data-review-id="${id}"]`)!;
}

function aiButton(id: string): HTMLButtonElement {
  return card(id).querySelector<HTMLButtonElement>('.respondera-trigger-btn')!;
}

function panel(): HTMLIFrameElement | null {
  return document.querySelector<HTMLIFrameElement>('#respondera-panel-frame');
}

// Simula uma mensagem enviada de dentro do painel (iframe) para a página
function messageFromPanel(data: object): void {
  window.dispatchEvent(new MessageEvent('message', { data, source: panel()!.contentWindow }));
}

// Abre o painel de uma avaliação e devolve os dados que o content script envia para ele
async function openPanelFor(id: string): Promise<Record<string, unknown>> {
  aiButton(id).click();
  const frameWindow = panel()!.contentWindow!;
  const received = new Promise<Record<string, unknown>>((done) => {
    frameWindow.addEventListener('message', (e) => {
      if (e.data?.type === 'RESPONDERA_DATA') done(e.data.data);
    });
  });
  messageFromPanel({ type: 'RESPONDERA_READY' });
  return received;
}

const flushObserver = () => new Promise((done) => setTimeout(done, 0));

beforeAll(async () => {
  loadMockPage();

  vi.stubGlobal('chrome', {
    runtime: {
      getURL: () => 'about:blank',
      onMessage: { addListener: vi.fn() },
    },
  });
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn() }));

  await import('../src/content');
});

describe('injeção do botão', () => {
  it('coloca um botão "Responder com IA" ao lado de cada botão "Responder" do Google', () => {
    const buttons = document.querySelectorAll('.respondera-trigger-btn');
    expect(buttons).toHaveLength(TOTAL_REVIEWS);

    const googleButton = card('mock-001').querySelector('button[aria-label="Responder"]')!;
    expect(googleButton.nextElementSibling).toBe(aiButton('mock-001'));
    expect(aiButton('mock-001').textContent).toBe('Responder com IA');
  });

  it('não duplica botões quando a página muda', async () => {
    document.body.appendChild(document.createElement('div'));
    await flushObserver();
    expect(document.querySelectorAll('.respondera-trigger-btn')).toHaveLength(TOTAL_REVIEWS);
  });

  it('acompanha avaliações carregadas depois, ignorando as que já têm resposta', async () => {
    const list = document.getElementById('reviews-list')!;
    list.insertAdjacentHTML(
      'beforeend',
      `<div class="review-card" data-review-id="nova-sem-resposta">
         <article><span data-star-rating="3"></span><div data-review-text>Ok</div></article>
         <div><button aria-label="Responder">Responder</button></div>
       </div>
       <div class="review-card" data-review-id="nova-com-resposta">
         <article><span data-star-rating="5"></span><div data-owner-reply>Obrigado!</div></article>
         <div><button aria-label="Responder">Responder</button></div>
       </div>`,
    );
    await flushObserver();

    expect(aiButton('nova-sem-resposta')).not.toBeNull();
    expect(aiButton('nova-com-resposta')).toBeNull();
  });
});

describe('extração dos dados da avaliação', () => {
  it('lê nome, nota, texto e notas detalhadas', async () => {
    const data = await openPanelFor('mock-001');
    expect(data).toMatchObject({
      reviewerName: 'Carlos Silva',
      rating: 5,
      hasExistingReply: false,
      detailRatings: {
        Comida: '5',
        Serviço: '5',
        Ambiente: '5',
        'Tipo de refeição': 'Jantar',
        'Preço por pessoa': 'R$ 40–60',
      },
    });
    expect(data.text).toMatch(/^Fui jantar ontem e foi uma boa surpresa\./);
  });

  it('trata avaliação só com nota, sem texto', async () => {
    const data = await openPanelFor('mock-005');
    expect(data).toMatchObject({ reviewerName: 'Usuário do Google', rating: 1, text: null });
    expect(data.detailRatings).toBeUndefined();
  });
});

describe('painel', () => {
  it('abre o painel e o campo de resposta do Google ao clicar no botão', () => {
    aiButton('mock-002').click();
    expect(panel()).not.toBeNull();
    expect(card('mock-002').querySelector('textarea[data-reply-field]')).not.toBeNull();
  });

  it('insere a resposta no campo da avaliação certa e fecha o painel', async () => {
    await openPanelFor('mock-003');
    const field = card('mock-003').querySelector<HTMLTextAreaElement>('textarea[data-reply-field]')!;
    const onInput = vi.fn();
    field.addEventListener('input', onInput);

    messageFromPanel({ type: 'RESPONDERA_INSERT', reply: 'Lamentamos muito, Roberto.' });

    expect(field.value).toBe('Lamentamos muito, Roberto.');
    expect(onInput).toHaveBeenCalled();
    expect(panel()).toBeNull();
  });

  it('fecha o painel quando ele pede', () => {
    aiButton('mock-006').click();
    messageFromPanel({ type: 'RESPONDERA_CLOSE' });
    expect(panel()).toBeNull();
  });

  it('ignora mensagens que não vêm do painel', async () => {
    await openPanelFor('mock-007');
    const field = card('mock-007').querySelector<HTMLTextAreaElement>('textarea[data-reply-field]')!;

    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'RESPONDERA_INSERT', reply: 'texto injetado pela página' },
        source: window,
      }),
    );

    expect(field.value).toBe('');
    expect(panel()).not.toBeNull();
  });
});
