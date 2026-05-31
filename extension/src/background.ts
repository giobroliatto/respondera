// background.ts — service worker da extensão
// Gerencia comunicação entre content script e popup.
// O Prompt 6 implementa os message handlers.

chrome.runtime.onInstalled.addListener(() => {
  console.log('[Respondera] extensão instalada/atualizada');
});
