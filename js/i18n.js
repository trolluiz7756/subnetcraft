// Spanish is the source language: every UI string is written in Spanish and looked up
// in the English dictionary when the language is English.
//
// - Constant text in the page (including text created later by other modules) is
//   translated automatically by walking the DOM and by a MutationObserver.
// - Sentences that contain values use t('… {name} …', { name }) at the call site.
import { EN } from './lang-en.js';

const LANG_KEY = 'ipcalc.lang';
const TITLE_ES = 'SubnetCraft — Planifica, divide y documenta redes IP';
const ATTRS = ['placeholder', 'title', 'aria-label', 'data-help', 'alt'];
const SKIP_TEXT = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'PRE', 'CODE']);

const hasDom = typeof document !== 'undefined';

function detectLang() {
  try {
    const stored = localStorage.getItem(LANG_KEY);
    if (stored === 'es' || stored === 'en') return stored;
  } catch { /* storage unavailable */ }
  const navLang = typeof navigator !== 'undefined' ? navigator.language : 'es';
  return (navLang || 'es').toLowerCase().startsWith('es') ? 'es' : 'en';
}

let lang = detectLang();

export function getLang() {
  return lang;
}

export function t(es, params) {
  let text = lang === 'en' && EN[es] !== undefined ? EN[es] : es;
  if (params) text = text.replace(/\{(\w+)\}/g, (match, key) => (key in params ? params[key] : match));
  return text;
}

// Numbers and decimals follow the language: 1.024 / 12,5 in Spanish, 1,024 / 12.5 in English.
export function num(value) {
  return Number(value).toLocaleString(lang);
}

export function dec(text) {
  return lang === 'es' ? String(text).replace('.', ',') : String(text);
}

const normalize = (s) => s.replace(/\s+/g, ' ').trim();
const originalText = new WeakMap();
const originalAttrs = new WeakMap();

function translateTextNode(node) {
  const parent = node.parentElement;
  if (parent && SKIP_TEXT.has(parent.tagName)) return;
  const stored = originalText.get(node);
  const raw = stored !== undefined ? stored : node.nodeValue;
  const key = normalize(raw);
  if (!key) return;

  if (lang === 'en') {
    const en = EN[key];
    if (en === undefined) return;
    if (stored === undefined) originalText.set(node, raw);
    const lead = raw.match(/^\s*/)[0];
    const trail = raw.match(/\s*$/)[0];
    node.nodeValue = lead + en + trail;
  } else if (stored !== undefined) {
    node.nodeValue = stored;
    originalText.delete(node);
  }
}

function translateAttributes(el) {
  ATTRS.forEach((attr) => {
    if (!el.hasAttribute(attr)) return;
    const record = originalAttrs.get(el) || {};
    const current = el.getAttribute(attr);
    const stored = record[attr];
    const raw = stored !== undefined ? stored : current;

    if (lang === 'en') {
      const en = EN[normalize(raw)];
      if (en === undefined) return;
      if (stored === undefined) {
        record[attr] = raw;
        originalAttrs.set(el, record);
      }
      // Guard against re-entrancy: setAttribute below is itself observed.
      if (current !== en) el.setAttribute(attr, en);
    } else if (stored !== undefined) {
      if (current !== stored) el.setAttribute(attr, stored);
      delete record[attr];
    }
  });
}

function translateTree(node) {
  if (node.nodeType === 3) {
    translateTextNode(node);
    return;
  }
  if (node.nodeType !== 1) return;
  translateAttributes(node);
  node.childNodes.forEach(translateTree);
}

function applyLang() {
  if (!hasDom) return;
  document.documentElement.lang = lang;
  document.title = t(TITLE_ES);
  translateTree(document.body);
}

// The DOM-walking side of translation (and the title/lang attribute updates)
// only makes sense in a browser. Node (e.g. the test suite, which imports
// ip-utils.js/ipv6-utils.js and transitively this module for t()) has no
// document — t()/num()/dec()/getLang()/setLang() must still work there.
if (hasDom) {
  new MutationObserver((records) => {
    if (lang !== 'en') return;
    records.forEach((record) => {
      if (record.type === 'attributes') {
        if (record.target.nodeType === 1) translateAttributes(record.target);
      } else {
        record.addedNodes.forEach(translateTree);
      }
    });
  }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ATTRS });

  applyLang();
}

export function setLang(next) {
  if (next !== 'es' && next !== 'en') return;
  if (next === lang) return;
  lang = next;
  try { localStorage.setItem(LANG_KEY, lang); } catch { /* storage unavailable */ }
  applyLang();
  window.dispatchEvent(new CustomEvent('ipcalc:lang', { detail: lang }));
}
