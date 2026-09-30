import {
  isValidIPv4, ipToInt, intToIp, prefixToMaskInt, maskIntToPrefix, isValidMask,
} from './ip-utils.js';
import { t, num } from './i18n.js';

const SAVED_SUBNETS_KEY = 'ipcalc.savedSubnets';

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function blockSize(prefix) {
  return Math.pow(2, 32 - prefix);
}

// "10.0.0.0/8" or a bare IP (treated as /32). Host bits are masked off.
function parseCidr(text) {
  const [addr, pfx] = text.trim().split('/');
  if (!isValidIPv4(addr)) throw new Error(t('Dirección inválida: "{text}"', { text: text.trim() }));
  const prefix = pfx === undefined ? 32 : Number(pfx);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) throw new Error(t('Prefijo inválido en "{text}"', { text: text.trim() }));
  const start = (ipToInt(addr) & prefixToMaskInt(prefix)) >>> 0;
  return { start, prefix, end: start + blockSize(prefix) - 1 };
}

function fmt(block) {
  return `${intToIp(block.start)}/${block.prefix}`;
}

function show(out, html, isError = false) {
  out.hidden = false;
  out.classList.toggle('tool-error', isError);
  out.innerHTML = html;
}

function kv(rows) {
  return rows.map(([k, v]) => `<div class="result-row"><span class="result-label">${k}</span><span class="result-value mono" title="Clic para copiar">${v}</span></div>`).join('');
}

// ---- 1. Is this IP inside this network? ----
const containsForm = document.getElementById('t-contains-form');
const containsOut = document.getElementById('t-contains-out');

containsForm.addEventListener('submit', (e) => {
  e.preventDefault();
  try {
    const ip = document.getElementById('t-contains-ip').value.trim();
    if (!isValidIPv4(ip)) throw new Error(t('Dirección IP inválida'));
    const net = parseCidr(document.getElementById('t-contains-net').value);
    const value = ipToInt(ip);
    const inside = value >= net.start && value <= net.end;
    show(containsOut, kv([
      [t('Resultado'), inside ? t('Sí, pertenece a la red') : t('No pertenece a la red')],
      [t('Red'), fmt(net)],
      [t('Rango'), `${intToIp(net.start)} – ${intToIp(net.end)}`],
      ...(inside ? [[t('Posición en la red'), `+${value - net.start}`]] : []),
    ]));
  } catch (err) {
    show(containsOut, escapeHtml(err.message), true);
  }
});

// ---- 2. Route summarisation ----
const aggForm = document.getElementById('t-agg-form');
const aggOut = document.getElementById('t-agg-out');

function summarise(blocks) {
  let list = blocks.map((b) => ({ start: b.start, prefix: b.prefix }));
  let changed = true;
  while (changed) {
    changed = false;
    list.sort((a, b) => a.start - b.start || a.prefix - b.prefix);
    const out = [];
    list.forEach((b) => {
      const prev = out[out.length - 1];
      if (prev) {
        if (b.start <= prev.start + blockSize(prev.prefix) - 1) {
          changed = true;
          return;
        }
        const canMerge = prev.prefix === b.prefix && prev.prefix > 0
          && prev.start % Math.pow(2, 33 - prev.prefix) === 0
          && prev.start + blockSize(prev.prefix) === b.start;
        if (canMerge) {
          out[out.length - 1] = { start: prev.start, prefix: prev.prefix - 1 };
          changed = true;
          return;
        }
      }
      out.push(b);
    });
    list = out;
  }
  return list;
}

function coveringPrefix(minStart, maxEnd) {
  for (let p = 32; p > 0; p -= 1) {
    if ((minStart >>> (32 - p)) === (maxEnd >>> (32 - p))) {
      return { start: ((minStart >>> (32 - p)) << (32 - p)) >>> 0, prefix: p };
    }
  }
  return { start: 0, prefix: 0 };
}

aggForm.addEventListener('submit', (e) => {
  e.preventDefault();
  try {
    const lines = document.getElementById('t-agg-input').value.split(/[\n,;]+/).map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) throw new Error(t('Escribe al menos una red (una por línea)'));
    const blocks = lines.map(parseCidr);
    const summary = summarise(blocks);
    const minStart = Math.min(...blocks.map((b) => b.start));
    const maxEnd = Math.max(...blocks.map((b) => b.end));
    const cover = coveringPrefix(minStart, maxEnd);
    const summarisedTotal = summary.reduce((sum, b) => sum + blockSize(b.prefix), 0);
    const exact = summary.length === 1;

    show(aggOut, `
      ${kv([
        [t('Entradas'), String(lines.length)],
        [t('Rutas resumidas'), `${summary.length}`],
      ])}
      <pre class="tool-pre">${summary.map(fmt).join('\n')}</pre>
      ${kv([
        [t('Supernet único que las cubre'), fmt(cover)],
        [t('Direcciones en el supernet'), num(blockSize(cover.prefix))],
        [t('Direcciones en las rutas resumidas'), num(summarisedTotal)],
      ])}
      <p class="tool-note">${exact
        ? t('Las redes se resumen exactamente en una sola ruta.')
        : t('Usar el supernet único incluiría direcciones que no estaban en tu lista; las rutas resumidas de arriba son exactas.')}</p>
    `);
  } catch (err) {
    show(aggOut, escapeHtml(err.message), true);
  }
});

// ---- 3. Mask / wildcard / CIDR converter ----
const convForm = document.getElementById('t-conv-form');
const convOut = document.getElementById('t-conv-out');

convForm.addEventListener('submit', (e) => {
  e.preventDefault();
  try {
    const text = document.getElementById('t-conv-input').value.trim();
    let prefix;
    const asPrefix = text.match(/^\/?(\d{1,2})$/);
    if (asPrefix) {
      prefix = Number(asPrefix[1]);
      if (prefix > 32) throw new Error(t('El prefijo debe estar entre 0 y 32'));
    } else if (isValidIPv4(text)) {
      if (isValidMask(text)) {
        prefix = maskIntToPrefix(ipToInt(text));
      } else {
        prefix = maskIntToPrefix((~ipToInt(text)) >>> 0);
        if (prefix === null) throw new Error(t('No es una máscara ni un wildcard válido (los bits deben ser contiguos)'));
      }
    } else {
      throw new Error(t('Escribe un prefijo (/24), una máscara (255.255.255.0) o un wildcard (0.0.0.255)'));
    }

    const mask = prefixToMaskInt(prefix);
    const size = blockSize(prefix);
    const usable = prefix <= 30 ? size - 2 : (prefix === 31 ? 2 : 1);
    show(convOut, kv([
      [t('Prefijo CIDR'), `/${prefix}`],
      [t('Máscara'), intToIp(mask)],
      ['Wildcard', intToIp((~mask) >>> 0)],
      [t('Direcciones totales'), num(size)],
      [t('Hosts utilizables'), num(usable)],
    ]));
  } catch (err) {
    show(convOut, escapeHtml(err.message), true);
  }
});

// ---- 4. Compare two subnets ----
const cmpForm = document.getElementById('t-cmp-form');
const cmpOut = document.getElementById('t-cmp-out');

cmpForm.addEventListener('submit', (e) => {
  e.preventDefault();
  try {
    const a = parseCidr(document.getElementById('t-cmp-a').value);
    const b = parseCidr(document.getElementById('t-cmp-b').value);

    let relation;
    if (a.start === b.start && a.prefix === b.prefix) relation = t('Son la misma red');
    else if (a.start <= b.start && a.end >= b.end) relation = t('La red A contiene a la red B');
    else if (b.start <= a.start && b.end >= a.end) relation = t('La red B contiene a la red A');
    else if (a.start > b.end || b.start > a.end) relation = t('No se traslapan');
    else relation = t('Se traslapan parcialmente');

    const sizeA = blockSize(a.prefix);
    const sizeB = blockSize(b.prefix);
    // CIDR block sizes are always powers of two, so this ratio is always a
    // whole number — never something like 2.5 that would need rounding.
    let sizeNote;
    if (sizeA === sizeB) {
      sizeNote = t('Del mismo tamaño ({n} direcciones cada una)', { n: num(sizeA) });
    } else {
      const bigger = sizeA > sizeB ? 'A' : 'B';
      const factor = Math.max(sizeA, sizeB) / Math.min(sizeA, sizeB);
      sizeNote = t('La red {bigger} es {factor}× más grande ({a} vs {b} direcciones)', {
        bigger, factor: num(factor), a: num(sizeA), b: num(sizeB),
      });
    }

    let adjacentNote = '';
    if (a.start > b.end || b.start > a.end) {
      if (summarise([a, b]).length === 1) {
        adjacentNote = t('Son adyacentes y se pueden resumir en una sola ruta: {cidr}', { cidr: fmt(summarise([a, b])[0]) });
      }
    }

    show(cmpOut, `
      ${kv([
        [t('Red A'), fmt(a)],
        [t('Red B'), fmt(b)],
        [t('Relación'), relation],
        [t('Tamaños'), sizeNote],
      ])}
      ${adjacentNote ? `<p class="tool-note">${adjacentNote}</p>` : ''}
    `);
  } catch (err) {
    show(cmpOut, escapeHtml(err.message), true);
  }
});

// ---- 5. Overlap detection ----
const ovlForm = document.getElementById('t-ovl-form');
const ovlInput = document.getElementById('t-ovl-input');
const ovlOut = document.getElementById('t-ovl-out');
const ovlLoad = document.getElementById('t-ovl-load');

ovlLoad.addEventListener('click', () => {
  let saved = [];
  try { saved = JSON.parse(localStorage.getItem(SAVED_SUBNETS_KEY) || '[]'); } catch { saved = []; }
  const lines = (Array.isArray(saved) ? saved : []).map((s) => {
    const net = (ipToInt(s.ip) & prefixToMaskInt(s.prefix)) >>> 0;
    return `${intToIp(net)}/${s.prefix}${s.vlan ? ` ${s.vlan}` : ''}`;
  });
  ovlInput.value = lines.join('\n');
  if (lines.length === 0) show(ovlOut, t('No hay subredes guardadas en la calculadora todavía.'), true);
});

ovlForm.addEventListener('submit', (e) => {
  e.preventDefault();
  try {
    const entries = ovlInput.value.split('\n').map((l) => l.trim()).filter(Boolean).map((line) => {
      const [cidr, ...rest] = line.split(/\s+/);
      return { ...parseCidr(cidr), label: rest.join(' ') };
    });
    if (entries.length < 2) throw new Error(t('Escribe al menos dos redes (una por línea) para compararlas'));

    const findings = [];
    for (let i = 0; i < entries.length; i += 1) {
      for (let j = i + 1; j < entries.length; j += 1) {
        const a = entries[i];
        const b = entries[j];
        if (a.start > b.end || b.start > a.end) continue;
        const name = (x) => `${fmt(x)}${x.label ? ` (${escapeHtml(x.label)})` : ''}`;
        let relation = t('se traslapa con');
        if (a.start === b.start && a.prefix === b.prefix) relation = t('es idéntica a');
        else if (a.start <= b.start && a.end >= b.end) relation = t('contiene a');
        else if (b.start <= a.start && b.end >= a.end) relation = t('está contenida en');
        findings.push(`${name(a)} ${relation} ${name(b)}`);
      }
    }

    show(ovlOut, findings.length === 0
      ? `<p class="tool-note">${t('Sin traslapes entre las {n} redes.', { n: entries.length })}</p>`
      : `${kv([[t('Traslapes encontrados'), String(findings.length)]])}<pre class="tool-pre">${findings.join('\n')}</pre>`);
  } catch (err) {
    show(ovlOut, escapeHtml(err.message), true);
  }
});
