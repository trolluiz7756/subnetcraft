import { t, getLang, setLang } from './i18n.js';

const tabButtons = document.querySelectorAll('.tab-btn');
const panels = document.querySelectorAll('.tab-panel');

function showTab(name) {
  const panel = document.getElementById(`tab-${name}`);
  if (!panel) return;
  tabButtons.forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  panels.forEach((p) => p.classList.toggle('active', p === panel));
}

tabButtons.forEach((btn) => {
  btn.addEventListener('click', () => showTab(btn.dataset.tab));
});

window.addEventListener('ipcalc:show-tab', (e) => showTab(e.detail));

// ---------- Mobile hamburger menu (collapses the tab row on narrow screens) ----------
const tabsToggle = document.getElementById('tabs-toggle');
const tabsMenu = document.getElementById('tabs-menu');

function setTabsMenu(open) {
  tabsMenu.classList.toggle('open', open);
  tabsToggle.setAttribute('aria-expanded', String(open));
}

tabsToggle.addEventListener('click', () => setTabsMenu(!tabsMenu.classList.contains('open')));

tabButtons.forEach((btn) => btn.addEventListener('click', () => setTabsMenu(false)));

document.addEventListener('click', (e) => {
  if (tabsMenu.classList.contains('open') && !e.target.closest('.tabs') && !e.target.closest('#tabs-toggle')) {
    setTabsMenu(false);
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && tabsMenu.classList.contains('open')) {
    setTabsMenu(false);
    tabsToggle.focus();
  }
});

// Resizing past the mobile breakpoint (e.g. rotating a tablet, or a devtools
// resize) shouldn't leave the menu stuck open behind a now-hidden hamburger.
window.addEventListener('resize', () => {
  if (window.innerWidth > 720) setTabsMenu(false);
});

// Shared links open on the tab that produced them.
if (location.hash.startsWith('#s=')) showTab('splitter');
else if (location.hash.startsWith('#c=')) showTab('calculator');

// Theme toggle (persisted in localStorage; falls back to OS preference).
const root = document.documentElement;
const themeToggle = document.getElementById('theme-toggle');

function currentTheme() {
  const stored = safeGet('theme');
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function safeGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function safeSet(key, value) {
  try { localStorage.setItem(key, value); } catch { /* storage unavailable */ }
}

function applyTheme(theme) {
  root.dataset.theme = theme;
}

applyTheme(currentTheme());

themeToggle.addEventListener('click', () => {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  safeSet('theme', next);
});

// ---------- Language toggle (ES / EN) ----------
const langToggle = document.getElementById('lang-toggle');

function paintLangToggle() {
  langToggle.textContent = getLang() === 'es' ? 'EN' : 'ES';
}

paintLangToggle();

langToggle.addEventListener('click', () => {
  setLang(getLang() === 'es' ? 'en' : 'es');
});

window.addEventListener('ipcalc:lang', paintLangToggle);

// ---------- Help menu (task shortcuts) ----------
const SEEN_KEY = 'ipcalc.helpMenuSeen';
const helpToggle = document.getElementById('help-toggle');
const helpMenu = document.getElementById('help-menu');

// Right-align the menu with its button, then clamp it inside the viewport.
function placeMenu() {
  const margin = 8;
  const wrap = helpToggle.parentElement.getBoundingClientRect();
  const width = helpMenu.offsetWidth;
  let left = wrap.right - width;
  left = Math.max(margin, Math.min(left, window.innerWidth - width - margin));
  helpMenu.style.right = 'auto';
  helpMenu.style.left = `${left - wrap.left}px`;
}

function setMenu(open) {
  helpMenu.hidden = !open;
  helpToggle.setAttribute('aria-expanded', String(open));
  if (open) {
    safeSet(SEEN_KEY, '1');
    placeMenu();
  }
}

// Shown open on the very first visit so new users notice it; afterwards it stays closed.
setMenu(safeGet(SEEN_KEY) !== '1');

helpToggle.addEventListener('click', () => setMenu(helpMenu.hidden));
window.addEventListener('resize', () => { if (!helpMenu.hidden) placeMenu(); });

document.querySelectorAll('.guide-item').forEach((btn) => {
  btn.addEventListener('click', () => {
    showTab(btn.dataset.goto);
    setMenu(false);
  });
});

document.addEventListener('click', (e) => {
  if (!helpMenu.hidden && !e.target.closest('.help-wrap')) setMenu(false);
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !helpMenu.hidden) {
    setMenu(false);
    helpToggle.focus();
  }
});

// ---------- Click any result value to copy it ----------
const toast = document.createElement('div');
toast.className = 'toast';
toast.setAttribute('role', 'status');
document.body.appendChild(toast);
let toastTimer;

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 1400);
}

document.addEventListener('click', async (e) => {
  const el = e.target.closest('.results-grid .result-value, .tool-out .result-value');
  if (!el) return;
  const text = el.textContent.trim();
  try {
    await navigator.clipboard.writeText(text);
    showToast(t('Copiado: {text}', { text }));
  } catch {
    showToast(t('No se pudo copiar'));
  }
});

// ---------- Keyboard: Alt+1..5 switches tab ----------
tabButtons.forEach((b, i) => { b.title = `Alt+${i + 1}`; });

document.addEventListener('keydown', (e) => {
  if (!e.altKey || e.ctrlKey || e.metaKey) return;
  const n = Number(e.key);
  if (Number.isInteger(n) && n >= 1 && n <= tabButtons.length) {
    e.preventDefault();
    tabButtons[n - 1].click();
  }
});

// ---------- Tell password managers these are not login fields ----------
// LastPass, 1Password, Bitwarden and Dashlane each honor their own attribute.
const IGNORE_ATTRS = {
  'data-lpignore': 'true',
  'data-1p-ignore': 'true',
  'data-bwignore': 'true',
  'data-form-type': 'other',
};

function markField(el) {
  Object.entries(IGNORE_ATTRS).forEach(([name, value]) => el.setAttribute(name, value));
  if (el.tagName !== 'SELECT' && !el.hasAttribute('autocomplete')) el.setAttribute('autocomplete', 'off');
}

document.querySelectorAll('input, textarea, select').forEach(markField);

// Rows and table inputs are created later, so keep marking new fields as they appear.
new MutationObserver((records) => {
  records.forEach((record) => record.addedNodes.forEach((node) => {
    if (node.nodeType !== 1) return;
    if (node.matches('input, textarea, select')) markField(node);
    node.querySelectorAll('input, textarea, select').forEach(markField);
  }));
}).observe(document.body, { childList: true, subtree: true });

// ---------- PWA: offline support + "Install app" button ----------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { /* offline support just won't be available */ });
  });
}

const installBtn = document.getElementById('install-app');
let deferredInstallPrompt = null;

// Fired by the browser when the manifest + service worker criteria are met.
// Chromium-based browsers only (Safari/Firefox have no equivalent event —
// the button simply never appears there, which is fine).
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  installBtn.hidden = false;
});

installBtn.addEventListener('click', async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  installBtn.hidden = true;
});

window.addEventListener('appinstalled', () => {
  installBtn.hidden = true;
  deferredInstallPrompt = null;
});
