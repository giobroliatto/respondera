// content.ts — injetado nas páginas do Google Business e no mock local

console.log('[Respondera] content script carregado em', window.location.href);

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface ReviewData {
  text: string | null;
  rating: number | null;
  reviewerName: string | null;
  hasExistingReply: boolean;
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

  return { text, rating, reviewerName, hasExistingReply };
}

// ─── Inserção de resposta no campo ────────────────────────────────────────────
// Usar nativeInputValueSetter para compatibilidade com React/Angular que
// monitoram eventos do DOM e ignoram atribuições diretas a .value

export function insertReplyIntoField(replyText: string): boolean {
  const field = findFirst(document, REPLY_FIELD_SELECTORS) as HTMLTextAreaElement | null;
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
  btn.textContent = '✨ Responder com IA';
  btn.style.cssText = [
    'display:inline-flex',
    'align-items:center',
    'gap:4px',
    'background:#4F46E5',
    'color:#fff',
    'border:none',
    'border-radius:6px',
    'padding:6px 12px',
    'font-size:13px',
    'font-weight:600',
    'cursor:pointer',
    'margin-top:8px',
    'font-family:inherit',
    'transition:background 0.15s',
  ].join(';');

  btn.addEventListener('mouseenter', () => { btn.style.background = '#4338CA'; });
  btn.addEventListener('mouseleave', () => { btn.style.background = '#4F46E5'; });

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

      // Indica loading
      btn.textContent = '⏳ Gerando...';
      btn.style.background = '#6B7280';
      (btn as HTMLButtonElement).disabled = true;

      chrome.runtime.sendMessage(
        { type: 'GENERATE_REPLY', data },
        (response: { reply?: string; error?: string } | undefined) => {
          btn.textContent = '✨ Responder com IA';
          btn.style.background = '#4F46E5';
          (btn as HTMLButtonElement).disabled = false;

          if (chrome.runtime.lastError) {
            console.error('[Respondera]', chrome.runtime.lastError.message);
            return;
          }

          if (response?.error) {
            alert(`Respondera: ${response.error}`);
            return;
          }

          if (response?.reply) {
            const inserted = insertReplyIntoField(response.reply);
            if (!inserted) {
              alert('Respondera: não foi possível encontrar o campo de resposta.');
            }
          }
        }
      );
    });

    replyArea.appendChild(btn);
  }
}

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
