// content.ts — injetado nos iframes do Google Avaliações
// URL alvo: https://www.google.com/local/business/*/customers/reviews*

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

// Texto visível dos botões "Responder" do Google (list view e reply view)
const RESPOND_BTN_LABELS = ['Responder', 'Reply'];

const STAR_SELECTORS = [
  '[data-star-rating]',
  '[aria-label*="estrela"]',
  '[aria-label*="star"]',
  'span[role="img"][aria-label]',
];

const REVIEWER_SELECTORS = [
  'a[href*="/maps/contrib/"]',  // link para perfil do avaliador no Google Maps
  '[data-reviewer-name]',
  '.d4r55',
  '.iV2VEc',
  '.TSUbDb',
];

const TEXT_SELECTORS = [
  '[data-review-text]',
  '.gyKkFe.JhRJje',             // classe observada no Google Business real
  '.wiI7pd',
  '.review-full-text',
  'span[data-expandable-section]',
  '.k8MTF',
];

// "Resposta pública" / "Public response" textarea
const REPLY_FIELD_SELECTORS = [
  'textarea[aria-label*="pública"]',
  'textarea[aria-label*="publica"]',
  'textarea[aria-label*="esposta"]',
  'textarea[aria-label*="esponse"]',
  '[data-reply-field]',
  'textarea[aria-label]',
  'textarea[placeholder]',
];

// ─── Utilitários ──────────────────────────────────────────────────────────────

function findFirst(root: Element | Document, selectors: string[]): Element | null {
  for (const sel of selectors) {
    try {
      const el = root.querySelector(sel);
      if (el) return el;
    } catch { /* seletor inválido */ }
  }
  return null;
}

// ─── Detecção de botões "Responder" do Google ─────────────────────────────────
// Usa aria-label como estratégia principal; cai para texto visível como fallback,
// pois Google não garante aria-label em todos os builds.

function findGoogleRespondButtons(): HTMLButtonElement[] {
  const result: HTMLButtonElement[] = [];
  const seen = new Set<HTMLButtonElement>();

  // Estratégia 1: aria-label (mais estável)
  for (const label of RESPOND_BTN_LABELS) {
    document.querySelectorAll<HTMLButtonElement>(`button[aria-label="${label}"]`)
      .forEach(btn => { if (!seen.has(btn)) { seen.add(btn); result.push(btn); } });
  }

  // Estratégia 2: texto visível (fallback para builds sem aria-label)
  // Ignora o botão submit da reply form (que também tem texto "Responder")
  // verificando se o campo de resposta já está visível
  if (!findFirst(document, REPLY_FIELD_SELECTORS)) {
    document.querySelectorAll<HTMLButtonElement>('button').forEach(btn => {
      if (seen.has(btn)) return;
      if (btn.classList.contains('respondera-trigger-btn')) return;
      const text = btn.textContent?.trim();
      if (RESPOND_BTN_LABELS.some(l => text === l)) {
        seen.add(btn);
        result.push(btn);
      }
    });
  }

  return result;
}

// ─── Container da avaliação ───────────────────────────────────────────────────

function findReviewContainer(btn: HTMLButtonElement): Element {
  // No Google Business real, o conteúdo da avaliação (article.VaHEVc) e os botões
  // de ação (div.UP87Yb) são irmãos dentro de um wrapper. Retornamos o wrapper pai
  // para que dados e o campo de resposta fiquem no mesmo escopo de busca.
  let el: Element | null = btn.parentElement;
  while (el && el !== document.body) {
    if (el.previousElementSibling?.tagName === 'ARTICLE') {
      return el.parentElement ?? el;
    }
    if (el.tagName === 'ARTICLE') {
      return el.parentElement ?? el;
    }
    el = el.parentElement;
  }

  const byAttr = btn.closest('[data-review-id]');
  if (byAttr) return byAttr;

  el = btn.parentElement;
  for (let i = 0; i < 8 && el; i++) {
    const hasRating = !!findFirst(el, STAR_SELECTORS);
    const hasText = (el.textContent?.trim().length ?? 0) > 30;
    if (hasRating && hasText) return el;
    el = el.parentElement;
  }

  return btn.parentElement?.parentElement?.parentElement
    ?? btn.parentElement
    ?? btn;
}

// ─── Extração de dados ────────────────────────────────────────────────────────

function extractReviewData(container: Element): ReviewData {
  const textEl = findFirst(container, TEXT_SELECTORS);
  const text = textEl?.textContent?.trim() || null;

  const reviewerEl = findFirst(container, REVIEWER_SELECTORS);
  const reviewerName = reviewerEl?.textContent?.trim() || null;

  let rating: number | null = null;
  const ratingEl = findFirst(container, STAR_SELECTORS);
  if (ratingEl) {
    const dataAttr = ratingEl.getAttribute('data-star-rating');
    if (dataAttr) {
      rating = parseInt(dataAttr, 10);
    } else {
      const label = ratingEl.getAttribute('aria-label') ?? '';
      const match = label.match(/(\d)/);
      if (match) rating = parseInt(match[1], 10);
    }
  }

  const hasExistingReply =
    !!container.querySelector('.respondera-trigger-btn') ||
    !!container.querySelector('[data-owner-reply]') ||
    !!container.querySelector('button[aria-label*="Editar resposta"]') ||
    !!container.querySelector('button[aria-label*="Edit reply"]');

  const detailRatings: Record<string, string> = {};

  const rawDetails = (container as HTMLElement).dataset?.details;
  if (rawDetails) {
    try {
      const parsed = JSON.parse(rawDetails) as Record<string, unknown>;
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v === 'string' || typeof v === 'number') {
          detailRatings[k] = String(v);
        }
      }
    } catch { /* JSON inválido */ }
  }

  container.querySelectorAll('.UzThIf').forEach((el) => {
    const label = el.querySelector('.KF1hCb')?.textContent?.trim();
    const value = el.querySelector('.lTi8oc')?.getAttribute('aria-label')
      ?? el.querySelector('.lTi8oc')?.textContent?.trim();
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

export function insertReplyIntoField(replyText: string, container?: Element | null): boolean {
  // Se o container foi removido do DOM (transição de view), usa document
  const root = (container && document.body.contains(container))
    ? container
    : document;

  const field = findFirst(root, REPLY_FIELD_SELECTORS) as HTMLTextAreaElement | null;
  if (!field) {
    console.warn('[Respondera] campo de resposta não encontrado');
    return false;
  }

  const nativeSetter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype, 'value'
  )?.set;

  if (nativeSetter) {
    nativeSetter.call(field, replyText);
  } else {
    field.value = replyText;
  }

  field.dispatchEvent(new Event('input', { bubbles: true }));
  field.dispatchEvent(new Event('change', { bubbles: true }));
  field.focus();
  return true;
}

// ─── Detecção de tema ─────────────────────────────────────────────────────────

function bgLuminance(el: Element): number | null {
  const bg = window.getComputedStyle(el).backgroundColor;
  const m = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (!m) return null;
  const alpha = m[4] !== undefined ? parseFloat(m[4]) : 1;
  if (alpha < 0.1) return null;
  return 0.299 * +m[1] + 0.587 * +m[2] + 0.114 * +m[3];
}

function isDarkMode(): boolean {
  // O body do iframe do Google é sempre transparente — o tema é aplicado em
  // elementos internos. Subimos a partir do botão "Responder" do Google até
  // encontrar o primeiro ancestral com cor sólida de fundo (o container temático).
  const anchor =
    document.querySelector<HTMLElement>('button[aria-label="Responder"]') ??
    document.querySelector<HTMLElement>('button[aria-label="Reply"]') ??
    document.querySelector<HTMLElement>('button:not(.respondera-trigger-btn)');

  if (anchor) {
    let el: Element | null = anchor.parentElement;
    while (el && el !== document.documentElement) {
      const lum = bgLuminance(el);
      if (lum !== null) return lum < 128;
      el = el.parentElement;
    }
  }

  // Fallback: body e html (improvável, mas mantém robustez)
  for (const root of [document.body, document.documentElement] as Element[]) {
    const lum = bgLuminance(root);
    if (lum !== null) return lum < 128;
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function themeColors(dark: boolean) {
  return {
    base:     dark ? '#8ab4f8' : '#1a73e8',   // Google Blue adaptado ao tema
    hover:    dark ? '#c4b5fd' : '#7c3aed',   // roxo IA adaptado
    bgHover:  dark ? 'rgba(124,58,237,0.18)' : '#f3e8ff',
  };
}

// ─── Criação do botão "Responder com IA" ─────────────────────────────────────
// Cor adapta ao tema do Google (claro/escuro) via prefers-color-scheme + fallback de luminância.

function createButton(): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = 'respondera-trigger-btn';
  btn.type = 'button';
  btn.innerHTML = `<svg style="flex-shrink:0;transition:fill 0.2s" width="14" height="14" viewBox="0 0 56 56" xmlns="http://www.w3.org/2000/svg"><path d="M 26.6875 12.6602 C 26.9687 12.6602 27.1094 12.4961 27.1797 12.2383 C 27.9062 8.3242 27.8594 8.2305 31.9375 7.4570 C 32.2187 7.4102 32.3828 7.2461 32.3828 6.9648 C 32.3828 6.6836 32.2187 6.5195 31.9375 6.4726 C 27.8828 5.6524 28.0000 5.5586 27.1797 1.6914 C 27.1094 1.4336 26.9687 1.2695 26.6875 1.2695 C 26.4062 1.2695 26.2656 1.4336 26.1953 1.6914 C 25.3750 5.5586 25.5156 5.6524 21.4375 6.4726 C 21.1797 6.5195 20.9922 6.6836 20.9922 6.9648 C 20.9922 7.2461 21.1797 7.4102 21.4375 7.4570 C 25.5156 8.2774 25.4687 8.3242 26.1953 12.2383 C 26.2656 12.4961 26.4062 12.6602 26.6875 12.6602 Z M 15.3438 28.7852 C 15.7891 28.7852 16.0938 28.5039 16.1406 28.0821 C 16.9844 21.8242 17.1953 21.8242 23.6641 20.5821 C 24.0860 20.5117 24.3906 20.2305 24.3906 19.7852 C 24.3906 19.3633 24.0860 19.0586 23.6641 18.9883 C 17.1953 18.0977 16.9609 17.8867 16.1406 11.5117 C 16.0938 11.0899 15.7891 10.7852 15.3438 10.7852 C 14.9219 10.7852 14.6172 11.0899 14.5703 11.5352 C 13.7969 17.8164 13.4687 17.7930 7.0469 18.9883 C 6.6250 19.0821 6.3203 19.3633 6.3203 19.7852 C 6.3203 20.2539 6.6250 20.5117 7.1406 20.5821 C 13.5156 21.6133 13.7969 21.7774 14.5703 28.0352 C 14.6172 28.5039 14.9219 28.7852 15.3438 28.7852 Z M 31.2344 54.7305 C 31.8438 54.7305 32.2891 54.2852 32.4062 53.6524 C 34.0703 40.8086 35.8750 38.8633 48.5781 37.4570 C 49.2344 37.3867 49.6797 36.8945 49.6797 36.2852 C 49.6797 35.6758 49.2344 35.2070 48.5781 35.1133 C 35.8750 33.7070 34.0703 31.7617 32.4062 18.9180 C 32.2891 18.2852 31.8438 17.8633 31.2344 17.8633 C 30.6250 17.8633 30.1797 18.2852 30.0860 18.9180 C 28.4219 31.7617 26.5938 33.7070 13.9140 35.1133 C 13.2344 35.2070 12.7891 35.6758 12.7891 36.2852 C 12.7891 36.8945 13.2344 37.3867 13.9140 37.4570 C 26.5703 39.1211 28.3281 40.8321 30.0860 53.6524 C 30.1797 54.2852 30.6250 54.7305 31.2344 54.7305 Z"/></svg><span>Responder com IA</span>`;

  const svg = btn.querySelector('svg') as SVGElement;

  const applyTheme = () => {
    const { base, hover, bgHover } = themeColors(isDarkMode());
    svg.style.fill = base;
    btn.style.color = base;

    btn.onmouseenter = () => {
      btn.style.background = bgHover;
      btn.style.color = hover;
      svg.style.fill = hover;
    };
    btn.onmouseleave = () => {
      btn.style.background = 'transparent';
      btn.style.color = base;
      svg.style.fill = base;
    };
  };

  btn.style.cssText = [
    'display:inline-flex',
    'align-items:center',
    'gap:6px',
    'background:transparent',
    'border:none',
    'border-radius:4px',
    'padding:7px 15px',
    'font-size:14px',
    'font-weight:500',
    'cursor:pointer',
    'margin-left:8px',
    'font-family:Google Sans,Roboto,Arial,sans-serif',
    'letter-spacing:0.0107em',
    'line-height:1.25',
    'transition:background 0.2s,color 0.2s',
    'white-space:nowrap',
    'vertical-align:middle',
  ].join(';');

  applyTheme();

  // Reage à mudança de tema enquanto o botão estiver no DOM
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const onThemeChange = () => { if (document.body.contains(btn)) applyTheme(); };
  mq.addEventListener('change', onThemeChange);

  return btn;
}

// ─── Injeção: List View (reviews list com botões "Responder") ─────────────────

function injectListButtons(): void {
  const googleBtns = findGoogleRespondButtons();

  for (const googleBtn of googleBtns) {
    if (
      googleBtn.nextElementSibling?.classList.contains('respondera-trigger-btn') ||
      googleBtn.previousElementSibling?.classList.contains('respondera-trigger-btn')
    ) continue;

    const container = findReviewContainer(googleBtn);
    const data = extractReviewData(container);

    if (data.hasExistingReply) continue;

    const btn = createButton();

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      // Abre o campo "Resposta pública" do Google antes de abrir nosso painel,
      // para que o usuário veja onde a resposta vai parar ao clicar "Usar".
      const replyFieldAlreadyOpen = !!findFirst(container, REPLY_FIELD_SELECTORS);
      if (!replyFieldAlreadyOpen) {
        googleBtn.click();
      }

      openPanel(data, container);
    });

    googleBtn.insertAdjacentElement('afterend', btn);
  }
}

// ─── Injeção: Reply Form View (textarea "Resposta pública" já visível) ────────
// Cobre dois cenários: (a) usuário clicou "Responder" sem usar nosso botão,
// (b) modal aberto via link de e-mail (iframe /reviews/reply direto).

function injectReplyFormButton(): void {
  if (document.querySelector('.respondera-reply-form-btn')) return;

  const replyField = findFirst(document, REPLY_FIELD_SELECTORS) as HTMLElement | null;
  if (!replyField) return;

  // Encontra o botão de cancelar para ancorar nossa posição
  const cancelEl = Array.from(
    document.querySelectorAll<HTMLElement>('button, a[role="button"]')
  ).find(el => {
    const t = el.textContent?.trim();
    return t === 'Cancelar' || t === 'Cancel';
  });

  const btn = createButton();
  btn.classList.add('respondera-reply-form-btn');
  btn.style.marginLeft = '0';
  btn.style.marginRight = '8px';

  if (cancelEl) {
    cancelEl.insertAdjacentElement('beforebegin', btn);
  } else {
    // Caso e-mail (sem "Cancelar"): ancora antes do botão submit "Responder"
    const submitBtn = Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
      .find(b =>
        !b.classList.contains('respondera-trigger-btn') &&
        RESPOND_BTN_LABELS.some(l => b.textContent?.trim() === l)
      );
    if (submitBtn) {
      submitBtn.insertAdjacentElement('beforebegin', btn);
    } else {
      replyField.insertAdjacentElement('afterend', btn);
    }
  }

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();

    // Extrai dados da avaliação visível na reply form view
    const data = extractReviewData(document.body);
    openPanel(data, null);
  });
}

// ─── Injeção unificada (chamada pelo MutationObserver) ────────────────────────

function injectButtons(): void {
  if (findFirst(document, REPLY_FIELD_SELECTORS)) {
    injectReplyFormButton();
  } else {
    injectListButtons();
  }
}

// ─── Painel lateral (iframe overlay) ─────────────────────────────────────────

let panelIframe: HTMLIFrameElement | null = null;
let pendingPanelData: ReviewData | null = null;
let activeCard: Element | null = null;

function openPanel(data: ReviewData, container: Element | null): void {
  closePanel();

  activeCard = container;

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

// ─── Mensagens do painel ──────────────────────────────────────────────────────

window.addEventListener('message', (e) => {
  if (!panelIframe || e.source !== panelIframe.contentWindow) return;

  const msg = e.data as { type?: string; reply?: string };

  switch (msg?.type) {
    case 'RESPONDERA_READY':
      if (pendingPanelData) {
        panelIframe.contentWindow?.postMessage(
          { type: 'RESPONDERA_DATA', data: pendingPanelData },
          '*'
        );
        pendingPanelData = null;
      }
      break;

    case 'RESPONDERA_INSERT':
      if (msg.reply) {
        const root = (activeCard && document.body.contains(activeCard))
          ? activeCard
          : document;

        const field = findFirst(root, REPLY_FIELD_SELECTORS);

        if (!field && activeCard) {
          // Textarea ainda não apareceu — abre o campo do Google e tenta de novo
          const googleBtn = (activeCard as Element).querySelector<HTMLButtonElement>(
            'button[aria-label="Responder"], button[aria-label="Reply"]'
          ) ?? Array.from((activeCard as Element).querySelectorAll<HTMLButtonElement>('button'))
              .find(b => RESPOND_BTN_LABELS.some(l => b.textContent?.trim() === l));

          if (googleBtn) {
            googleBtn.click();
            const reply = msg.reply;
            setTimeout(() => insertReplyIntoField(reply, activeCard), 350);
            closePanel();
            break;
          }
        }

        insertReplyIntoField(msg.reply, root instanceof Document ? null : root as Element);
      }
      closePanel();
      break;

    case 'RESPONDERA_CLOSE':
      closePanel();
      break;
  }
});

// ─── Login notificado pelo popup ──────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message: { type?: string }) => {
  if (message.type === 'RESPONDERA_LOGGED_IN' && panelIframe) {
    panelIframe.contentWindow?.postMessage({ type: 'RESPONDERA_AUTH_UPDATE' }, '*');
  }
  return false;
});

// ─── MutationObserver ─────────────────────────────────────────────────────────

function startObserver(): void {
  injectButtons();

  const observer = new MutationObserver(() => {
    injectButtons();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

if (document.body) {
  startObserver();
} else {
  document.addEventListener('DOMContentLoaded', startObserver);
}
