// content.ts — injetado nas páginas do Google Business e no mock local

console.log('[Respondera] content script carregado em', window.location.href);

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface ReviewData {
  text: string | null;
  rating: number | null;
  reviewerName: string | null;
  hasExistingReply: boolean;
  tone?: string;
  detailRatings?: Record<string, string>;
}

// ─── Seletores ────────────────────────────────────────────────────────────────
// O Google atualiza o DOM sem aviso. Listamos múltiplos candidatos em ordem de
// preferência; a primeira correspondência vence.

// Cards de avaliação
const CARD_SELECTORS = [
  // Estrutura conhecida do Google Business (2024-2025)
  '[data-review-id]',                    // atributo presente em ambientes reais
  '.review-card',                        // mock local
  '[jscontroller][jsaction*="review"]',  // padrão JSAction do Google
  '.jfk-scrollbar-content > div > div', // padrão antigo
];

// Texto da avaliação
const TEXT_SELECTORS = [
  '[data-review-text]',          // mock
  '.review-full-text',           // Google (texto expandido)
  'span[data-expandable-section]',
  '.k8MTF',
  '.wiI7pd',
];

// Nome do avaliador
const REVIEWER_SELECTORS = [
  '[data-reviewer-name]',   // mock
  '.d4r55',
  '.iV2VEc',
  '.TSUbDb',
];

// Estrelas
const RATING_SELECTORS = [
  '[data-star-rating]',     // mock — lemos via getAttribute
  '[aria-label*="estrela"]',
  '[aria-label*="star"]',
  'span[role="img"][aria-label]',
];

// Campo de resposta (textarea)
const REPLY_FIELD_SELECTORS = [
  '[data-reply-field]',     // mock
  'textarea.reply-field',
  'textarea[aria-label]',
  'textarea[placeholder]',
];

// Indicador de que já existe resposta do dono
const EXISTING_REPLY_SELECTORS = [
  '.respondera-trigger-btn',  // nosso próprio botão já injetado
  '[data-owner-reply]',
  '.owner-response',
  '.DU9Pgb',
];

// ─── Utilitários ──────────────────────────────────────────────────────────────

function findFirst(root: Element | Document, selectors: string[]): Element | null {
  for (const sel of selectors) {
    const el = root.querySelector(sel);
    if (el) return el;
  }
  return null;
}

// ─── Detecção de cards ────────────────────────────────────────────────────────

function findReviewCards(): Element[] {
  for (const sel of CARD_SELECTORS) {
    const found = Array.from(document.querySelectorAll(sel));
    if (found.length > 0) {
      console.log(`[Respondera] cards encontrados com seletor: "${sel}" (${found.length})`);
      return found;
    }
  }
  return [];
}

// ─── Extração de dados ────────────────────────────────────────────────────────

function extractReviewData(card: Element): ReviewData {
  // Texto
  const textEl = findFirst(card, TEXT_SELECTORS);
  const text = textEl?.textContent?.trim() || null;

  // Avaliador
  const reviewerEl = findFirst(card, REVIEWER_SELECTORS);
  const reviewerName = reviewerEl?.textContent?.trim() || null;

  // Estrelas — tenta data-attribute primeiro, depois aria-label
  let rating: number | null = null;
  const ratingEl = findFirst(card, RATING_SELECTORS);
  if (ratingEl) {
    const dataAttr = ratingEl.getAttribute('data-star-rating');
    if (dataAttr) {
      rating = parseInt(dataAttr, 10);
    } else {
      // Extrai número de strings tipo "5 estrelas" / "4 stars"
      const label = ratingEl.getAttribute('aria-label') ?? '';
      const match = label.match(/(\d)/);
      if (match) rating = parseInt(match[1], 10);
    }
  }

  // Já tem resposta?
  const hasExistingReply = EXISTING_REPLY_SELECTORS.some(
    (sel) => card.querySelector(sel) !== null
  );

  // ─── Sub-notas detalhadas (comida, serviço, ambiente etc.) ─────────────────
  // Mock: atributo data-details com JSON diretamente no card
  // Google Business: pares label+valor em contêineres de subtópico
  const detailRatings: Record<string, string> = {};

  // Mock
  const rawDetails = card.getAttribute('data-details');
  if (rawDetails) {
    try {
      const parsed = JSON.parse(rawDetails) as Record<string, unknown>;
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v === 'string' || typeof v === 'number') {
          detailRatings[k] = String(v);
        }
      }
    } catch { /* JSON inválido — ignora */ }
  }

  // Google Business Management (DOM real)
  // Padrão 1: .UzThIf contém label + nota por aspecto
  card.querySelectorAll('.UzThIf').forEach((el) => {
    const label = el.querySelector('.KF1hCb')?.textContent?.trim();
    const value = el.querySelector('.lTi8oc')?.getAttribute('aria-label')
      ?? el.querySelector('.lTi8oc')?.textContent?.trim();
    if (label && value) detailRatings[label] = value;
  });

  // Padrão 2: tabelas de detalhes (.hGLX6d rows com label + valor)
  card.querySelectorAll('.hGLX6d').forEach((row) => {
    const cells = row.querySelectorAll('td, th');
    if (cells.length === 2) {
      const label = cells[0]!.textContent?.trim();
      const value = cells[1]!.textContent?.trim();
      if (label && value) detailRatings[label] = value;
    }
  });

  // Padrão 3: .review-snippet-details span pairs
  card.querySelectorAll('.review-snippet-detail').forEach((el) => {
    const label = el.querySelector('.detail-label')?.textContent?.trim();
    const value = el.querySelector('.detail-value')?.textContent?.trim();
    if (label && value) detailRatings[label] = value;
  });

  return {
    text,
    rating,
    reviewerName,
    hasExistingReply,
    detailRatings: Object.keys(detailRatings).length > 0 ? detailRatings : undefined,
  };
}

// ─── Inserção de resposta no campo ────────────────────────────────────────────
// Usar nativeInputValueSetter para compatibilidade com React/Angular que
// monitoram eventos do DOM e ignoram atribuições diretas a .value

export function insertReplyIntoField(replyText: string, card?: Element | null): boolean {
  // Busca dentro do card específico primeiro, depois no documento inteiro
  const root = card ?? document;
  const field = findFirst(root, REPLY_FIELD_SELECTORS) as HTMLTextAreaElement | null;
  if (!field) {
    console.warn('[Respondera] campo de resposta não encontrado');
    return false;
  }

  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype,
    'value'
  )?.set;

  if (nativeInputValueSetter) {
    nativeInputValueSetter.call(field, replyText);
  } else {
    field.value = replyText;
  }

  field.dispatchEvent(new Event('input', { bubbles: true }));
  field.dispatchEvent(new Event('change', { bubbles: true }));
  field.focus();
  return true;
}

// ─── Injeção do botão ─────────────────────────────────────────────────────────

function createButton(): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = 'respondera-trigger-btn';
  btn.innerHTML = '<svg style="fill:#1f2937;transition:fill 0.25s ease" width="15" height="15" viewBox="0 0 56 56" xmlns="http://www.w3.org/2000/svg"><path d="M 26.6875 12.6602 C 26.9687 12.6602 27.1094 12.4961 27.1797 12.2383 C 27.9062 8.3242 27.8594 8.2305 31.9375 7.4570 C 32.2187 7.4102 32.3828 7.2461 32.3828 6.9648 C 32.3828 6.6836 32.2187 6.5195 31.9375 6.4726 C 27.8828 5.6524 28.0000 5.5586 27.1797 1.6914 C 27.1094 1.4336 26.9687 1.2695 26.6875 1.2695 C 26.4062 1.2695 26.2656 1.4336 26.1953 1.6914 C 25.3750 5.5586 25.5156 5.6524 21.4375 6.4726 C 21.1797 6.5195 20.9922 6.6836 20.9922 6.9648 C 20.9922 7.2461 21.1797 7.4102 21.4375 7.4570 C 25.5156 8.2774 25.4687 8.3242 26.1953 12.2383 C 26.2656 12.4961 26.4062 12.6602 26.6875 12.6602 Z M 15.3438 28.7852 C 15.7891 28.7852 16.0938 28.5039 16.1406 28.0821 C 16.9844 21.8242 17.1953 21.8242 23.6641 20.5821 C 24.0860 20.5117 24.3906 20.2305 24.3906 19.7852 C 24.3906 19.3633 24.0860 19.0586 23.6641 18.9883 C 17.1953 18.0977 16.9609 17.8867 16.1406 11.5117 C 16.0938 11.0899 15.7891 10.7852 15.3438 10.7852 C 14.9219 10.7852 14.6172 11.0899 14.5703 11.5352 C 13.7969 17.8164 13.4687 17.7930 7.0469 18.9883 C 6.6250 19.0821 6.3203 19.3633 6.3203 19.7852 C 6.3203 20.2539 6.6250 20.5117 7.1406 20.5821 C 13.5156 21.6133 13.7969 21.7774 14.5703 28.0352 C 14.6172 28.5039 14.9219 28.7852 15.3438 28.7852 Z M 31.2344 54.7305 C 31.8438 54.7305 32.2891 54.2852 32.4062 53.6524 C 34.0703 40.8086 35.8750 38.8633 48.5781 37.4570 C 49.2344 37.3867 49.6797 36.8945 49.6797 36.2852 C 49.6797 35.6758 49.2344 35.2070 48.5781 35.1133 C 35.8750 33.7070 34.0703 31.7617 32.4062 18.9180 C 32.2891 18.2852 31.8438 17.8633 31.2344 17.8633 C 30.6250 17.8633 30.1797 18.2852 30.0860 18.9180 C 28.4219 31.7617 26.5938 33.7070 13.9140 35.1133 C 13.2344 35.2070 12.7891 35.6758 12.7891 36.2852 C 12.7891 36.8945 13.2344 37.3867 13.9140 37.4570 C 26.5703 39.1211 28.3281 40.8321 30.0860 53.6524 C 30.1797 54.2852 30.6250 54.7305 31.2344 54.7305 Z"/></svg><span>Responder com IA</span>';
  btn.style.cssText = [
    'display:inline-flex',
    'align-items:center',
    'gap:6px',
    'background:#ffffff',
    'color:#1f2937',
    'border:1.5px solid #e2e8f0',
    'border-radius:7px',
    'padding:8px 13px',
    'font-size:13px',
    'font-weight:600',
    'cursor:pointer',
    'margin-top:8px',
    'font-family:inherit',
    'box-shadow:0 1px 3px rgba(0,0,0,0.07)',
    'transition:border-color 0.25s ease,box-shadow 0.25s ease,background 0.25s ease',
  ].join(';');

  btn.addEventListener('mouseenter', () => {
    btn.style.borderColor = '#a78bfa';
    btn.style.boxShadow = '0 3px 12px rgba(139,92,246,0.15)';
    btn.style.background = '#fafaff';
    const svg = btn.querySelector('svg') as SVGElement | null;
    if (svg) svg.style.fill = '#10B981';
  });
  btn.addEventListener('mouseleave', () => {
    btn.style.borderColor = '#e2e8f0';
    btn.style.boxShadow = '0 1px 3px rgba(0,0,0,0.07)';
    btn.style.background = '#ffffff';
    const svg = btn.querySelector('svg') as SVGElement | null;
    if (svg) svg.style.fill = '#1f2937';
  });

  return btn;
}

function injectButtons(): void {
  const cards = findReviewCards();

  for (const card of cards) {
    // Não reinjetar
    if (card.querySelector('.respondera-trigger-btn')) continue;

    const data = extractReviewData(card);

    // Não injetar em cards que já têm resposta do dono
    // (exceto se o único seletor que bateu foi o nosso próprio botão — já tratado acima)
    if (data.hasExistingReply) continue;

    // Encontra a área de resposta dentro do card para ancorar o botão
    const replyArea = card.querySelector('.reply-area, [data-reply-field]')?.parentElement
      ?? card.querySelector('textarea')?.parentElement
      ?? card;

    const btn = createButton();

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openPanel(data, card);
    });

    replyArea.appendChild(btn);
  }
}

// ─── Painel lateral (iframe overlay) ───────────────────────────────────────

let panelIframe: HTMLIFrameElement | null = null;
let pendingPanelData: ReviewData | null = null;
let activeCard: Element | null = null;

function openPanel(data: ReviewData, card: Element): void {
  // Fecha painel anterior se estiver aberto
  closePanel();

  activeCard = card;

  const iframe = document.createElement('iframe');
  iframe.id = 'respondera-panel-frame';
  iframe.src = chrome.runtime.getURL('panel.html');
  iframe.style.cssText = [
    'position:fixed',
    'right:0',
    'top:0',
    'height:100vh',
    'width:360px',
    'z-index:999999',
    'border:none',
    'box-shadow:-6px 0 32px rgba(0,0,0,0.18)',
  ].join(';');
  iframe.setAttribute('title', 'Painel Respondera');

  panelIframe = iframe;
  pendingPanelData = data;
  document.body.appendChild(iframe);
}

function closePanel(): void {
  if (panelIframe) {
    panelIframe.remove();
    panelIframe = null;
  }
  pendingPanelData = null;
  activeCard = null;
}

// Mensagens recebidas do iframe do painel
window.addEventListener('message', (e) => {
  if (!panelIframe || e.source !== panelIframe.contentWindow) return;

  const msg = e.data as { type?: string; reply?: string };

  switch (msg?.type) {
    case 'RESPONDERA_READY':
      // Painel carregado — envia os dados da avaliação
      if (pendingPanelData) {
        panelIframe.contentWindow?.postMessage(
          { type: 'RESPONDERA_DATA', data: pendingPanelData },
          '*'
        );
        pendingPanelData = null;
      }
      break;

    case 'RESPONDERA_INSERT':
      if (msg.reply) insertReplyIntoField(msg.reply, activeCard);
      closePanel();
      break;

    case 'RESPONDERA_CLOSE':
      closePanel();
      break;
  }
});

// Notificação de login enviada pelo popup
chrome.runtime.onMessage.addListener((message: { type?: string }) => {
  if (message.type === 'RESPONDERA_LOGGED_IN' && panelIframe) {
    panelIframe.contentWindow?.postMessage({ type: 'RESPONDERA_AUTH_UPDATE' }, '*');
  }
  return false;
});

// ─── MutationObserver — detecta novos cards em SPA ───────────────────────────

function startObserver(): void {
  // Tenta injetar imediatamente (caso os cards já estejam no DOM)
  injectButtons();

  const observer = new MutationObserver(() => {
    injectButtons();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  console.log('[Respondera] MutationObserver ativo');
}

// Aguarda o body estar disponível
if (document.body) {
  startObserver();
} else {
  document.addEventListener('DOMContentLoaded', startObserver);
}
