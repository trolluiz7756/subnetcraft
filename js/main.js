import { t, getLang, setLang } from './i18n.js';

const tabButtons = document.querySelectorAll('.tab-btn');
const panels = document.querySelectorAll('.tab-panel');

function showTab(name) {
  const panel = document.getElementById(`tab-${name}`);
  if (!panel) return;
  tabButtons.forEach((b) => {
    const active = b.dataset.tab === name;
    b.classList.toggle('active', active);
    b.setAttribute('aria-selected', String(active));
  });
  panels.forEach((p) => p.classList.toggle('active', p === panel));
  // The active tab's label can be bold/wider, which changes how much room
  // the tab bar needs — re-check whether it still fits next to the icons.
  updateHeaderLayout();
}

tabButtons.forEach((btn) => {
  btn.addEventListener('click', () => showTab(btn.dataset.tab));
});

window.addEventListener('ipcalc:show-tab', (e) => showTab(e.detail));

// ---------- Adaptive header: collapse the tab row behind a hamburger menu
// whenever it (plus the brand and the utility icons) genuinely doesn't fit
// on one line, instead of guessing a single width that's "narrow enough".
// A fixed CSS breakpoint can't account for OS display scaling, browser
// zoom, font rendering, or translated labels being a different length —
// all of those change how many actual pixels the header needs. ----------
const pageHeader = document.querySelector('.page-header');
const brandRow = document.querySelector('.brand-row');
const utilityControls = document.querySelector('.utility-controls');
const tabsToggle = document.getElementById('tabs-toggle');
const tabsMenu = document.getElementById('tabs-menu');

function setTabsMenu(open) {
  tabsMenu.classList.toggle('open', open);
  tabsToggle.setAttribute('aria-expanded', String(open));
}

function headerFitsOnOneLine() {
  // Measure with the compact layout switched off: its CSS forces .tabs and
  // .utility-controls to width:100%, which would make this check trivially
  // pass once already compact.
  const wasCompact = pageHeader.classList.contains('header-compact');
  if (wasCompact) pageHeader.classList.remove('header-compact');

  // .tabs can also wrap its own buttons onto multiple lines when it's
  // squeezed (see style.css), which would make its scrollWidth reflect
  // whatever it's currently squeezed into rather than the width it truly
  // needs. Force one unwrapped row for the instant we measure it.
  const prevWrap = tabsMenu.style.flexWrap;
  const prevWidth = tabsMenu.style.width;
  tabsMenu.style.flexWrap = 'nowrap';
  tabsMenu.style.width = 'max-content';

  const style = getComputedStyle(pageHeader);
  const available = pageHeader.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  const gap = parseFloat(style.columnGap) || 0;
  // scrollWidth rounds to the nearest integer, so summing three of them can
  // land exactly on `available` while the real (sub-pixel) layout needed a
  // hair more and wrapped anyway. A small safety margin avoids flip-flopping
  // right at that knife-edge.
  const SAFETY_MARGIN = 4;
  const needed = brandRow.scrollWidth + tabsMenu.scrollWidth + utilityControls.scrollWidth + gap * 2 + SAFETY_MARGIN;

  tabsMenu.style.flexWrap = prevWrap;
  tabsMenu.style.width = prevWidth;
  if (wasCompact) pageHeader.classList.add('header-compact');
  return needed <= available;
}

function updateHeaderLayout() {
  const shouldBeCompact = !headerFitsOnOneLine();
  const wasCompact = pageHeader.classList.contains('header-compact');
  pageHeader.classList.toggle('header-compact', shouldBeCompact);
  // Leaving compact mode should not leave the hamburger's tab list stuck
  // open behind a now-hidden toggle button.
  if (wasCompact && !shouldBeCompact) setTabsMenu(false);
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

updateHeaderLayout();
window.addEventListener('resize', updateHeaderLayout);
// Translated labels are a different length, which can flip whether the
// tab bar fits (see headerFitsOnOneLine above).
window.addEventListener('ipcalc:lang', updateHeaderLayout);

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
  // [data-copy-row] (the splitter's table cells) copies a whole tab-separated
  // row instead of just the clicked cell's own text.
  const rowEl = e.target.closest('[data-copy-row]');
  const el = rowEl || e.target.closest('.results-grid .result-value, .tool-out .result-value');
  if (!el) return;
  const text = rowEl ? rowEl.dataset.copyRow : el.textContent.trim();
  try {
    await navigator.clipboard.writeText(text);
    showToast(rowEl ? t('Fila copiada') : t('Copiado: {text}', { text }));
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
const updateBanner = document.getElementById('update-banner');
const updateReload = document.getElementById('update-reload');
const updateDismiss = document.getElementById('update-dismiss');

function showUpdateBanner() {
  updateBanner.hidden = false;
}

updateReload.addEventListener('click', () => window.location.reload());
updateDismiss.addEventListener('click', () => { updateBanner.hidden = true; });

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then((reg) => {
      // Another tab may have already installed an update that is sitting
      // idle, waiting for every tab to close before it can take over.
      if (reg.waiting && navigator.serviceWorker.controller) showUpdateBanner();

      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          // "installed" with an existing controller means this is an update
          // to an already-running app, not the very first install.
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            showUpdateBanner();
          }
        });
      });
    }).catch(() => { /* offline support just won't be available */ });
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
