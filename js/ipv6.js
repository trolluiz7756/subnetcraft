import {
  parseIPv6Cidr, expandIPv6, compressIPv6, networkOf, lastOf, addressCount, groupDigits, describeType,
} from './ipv6-utils.js';
import { bitBarHtml, BIT_COLORS } from './bitbar.js';
import { t, num, dec } from './i18n.js';

const $ = (id) => document.getElementById(id);

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function flash(btn, text) {
  const original = btn.textContent;
  btn.textContent = text;
  setTimeout(() => { btn.textContent = original; }, 1200);
}

function prefixMeaning(p) {
  if (p <= 32) return t('Bloque muy grande, propio de un proveedor u organización enorme');
  if (p < 48) return t('Bloque de una organización grande o de un proveedor pequeño');
  if (p === 48) return t('Un sitio completo: contiene 65.536 redes /64');
  if (p < 56) return t('Una parte de un sitio (varios miles de redes /64)');
  if (p === 56) return t('Una oficina u hogar: contiene 256 redes /64');
  if (p < 64) return t('Unas pocas redes /64');
  if (p === 64) return t('Una LAN o VLAN. Es el tamaño estándar para equipos normales');
  if (p < 128) return t('Más pequeño que una LAN normal: la autoconfiguración (SLAAC) no funciona aquí');
  return t('Una sola dirección (un equipo)');
}

// Shows how the 128 bits split: network prefix, subnet ID and host part.
function anatomy(prefix, subnetPrefix = 64) {
  const sub = Math.max(0, Math.min(subnetPrefix, 128) - prefix);
  return bitBarHtml([
    { label: 'Red', bits: prefix, color: BIT_COLORS.network },
    { label: 'Subredes', bits: sub, color: BIT_COLORS.subnets },
    { label: 'Equipos', bits: 128 - prefix - sub, color: BIT_COLORS.hosts },
  ]);
}

// ---------- Sub-tabs (guided plan / calculator) ----------

document.querySelectorAll('.subtab').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.subtab').forEach((b) => b.classList.toggle('active', b === btn));
    document.querySelectorAll('.subpane').forEach((p) => p.classList.toggle('active', p.id === `v6-pane-${btn.dataset.subtab}`));
  });
});

// ---------- Calculator ----------

const form = $('v6-form');
const input = $('v6-input');
const note = $('v6-note');
const errorBox = $('v6-error');
const results = $('v6-results');
const splitCard = $('v6-split');
const splitForm = $('v6-split-form');
const splitPrefix = $('v6-split-prefix');
const splitInfo = $('v6-split-info');
const splitBody = $('v6-split-body');

const MAX_ROWS = 128;
let current = null;

function row(label, value) {
  const div = document.createElement('div');
  div.className = 'result-row';
  div.innerHTML = `<span class="result-label">${label}</span><span class="result-value mono v6-value" title="Clic para copiar">${value}</span>`;
  return div;
}

function showError(message) {
  errorBox.textContent = message;
  errorBox.hidden = false;
}

function render(value, prefix) {
  const network = networkOf(value, prefix);
  const last = lastOf(value, prefix);
  const total = addressCount(prefix);

  results.innerHTML = '';
  results.hidden = false;
  [
    ['Qué significa este prefijo', prefixMeaning(prefix)],
    ['Dirección (comprimida)', compressIPv6(value)],
    ['Dirección (expandida)', expandIPv6(value)],
    ['Prefijo', `/${prefix}`],
    ['Red', `${compressIPv6(network)}/${prefix}`],
    ['Primera dirección', compressIPv6(network)],
    ['Última dirección', compressIPv6(last)],
    ['Total de direcciones', `${dec(groupDigits(total))} (2^${128 - prefix})`],
    ['Subredes /64 contenidas', prefix <= 64 ? `${dec(groupDigits(1n << BigInt(64 - prefix)))} (2^${64 - prefix})` : '—'],
    ['Tipo', describeType(value)],
  ].forEach(([label, val]) => results.appendChild(row(label, val)));

  const bar = document.createElement('div');
  bar.className = 'bar-block';
  bar.innerHTML = `<div class="bar-title">${t('Cómo se reparten los 128 bits')}</div>${anatomy(prefix)}`;
  results.appendChild(bar);
}

let lastNoPrefix = false;

form.addEventListener('submit', (e) => {
  e.preventDefault();
  errorBox.hidden = true;
  results.hidden = true;
  splitCard.hidden = true;
  note.textContent = '';
  current = null;
  lastNoPrefix = false;
  try {
    let text = input.value.trim();
    if (text && !text.includes('/')) {
      text += '/64';
      lastNoPrefix = true;
      note.textContent = t('No escribiste prefijo, así que usé /64, el tamaño estándar de una LAN.');
    }
    const { value, prefix } = parseIPv6Cidr(text);
    current = { value, network: networkOf(value, prefix), prefix };
    render(value, prefix);
    splitCard.hidden = false;
    splitPrefix.min = String(Math.min(prefix + 1, 128));
    if (!splitPrefix.value || Number(splitPrefix.value) <= prefix) {
      splitPrefix.value = String(Math.min(prefix <= 60 ? 64 : prefix + 4, 128));
    }
    splitBody.innerHTML = '';
    splitInfo.textContent = '';
    lastSplitPrefix = null;
  } catch (err) {
    showError(err.message);
  }
});

document.querySelectorAll('.v6-example').forEach((btn) => {
  btn.addEventListener('click', () => {
    input.value = btn.dataset.value;
    form.dispatchEvent(new Event('submit', { cancelable: true }));
  });
});

let lastSplitPrefix = null;

function paintSplitList(newPrefix) {
  const bits = newPrefix - current.prefix;
  const count = 1n << BigInt(bits);
  const shown = count < BigInt(MAX_ROWS) ? Number(count) : MAX_ROWS;
  const step = 1n << BigInt(128 - newPrefix);

  splitBody.innerHTML = '';
  for (let i = 0; i < shown; i += 1) {
    const net = current.network + BigInt(i) * step;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${i + 1}</td>
      <td class="mono">${compressIPv6(net)}/${newPrefix}</td>
      <td class="mono">${compressIPv6(net)}</td>
      <td class="mono">${compressIPv6(lastOf(net, newPrefix))}</td>
    `;
    splitBody.appendChild(tr);
  }
  splitInfo.textContent = t('{count} subredes /{prefix} en total', { count: dec(groupDigits(count)), prefix: newPrefix })
    + (count > BigInt(MAX_ROWS) ? t(' (se muestran las primeras {max})', { max: MAX_ROWS }) : '') + '.';
}

splitForm.addEventListener('submit', (e) => {
  e.preventDefault();
  errorBox.hidden = true;
  if (!current) return;

  const newPrefix = Number(splitPrefix.value);
  if (!Number.isInteger(newPrefix) || newPrefix <= current.prefix || newPrefix > 128) {
    showError(t('El nuevo prefijo debe ser mayor que /{prefix} y a lo sumo /128', { prefix: current.prefix }));
    return;
  }
  if (newPrefix - current.prefix > 64) {
    showError(t('Solo se pueden listar divisiones de hasta 64 bits de diferencia'));
    return;
  }

  lastSplitPrefix = newPrefix;
  paintSplitList(newPrefix);
});

// ---------- Guided plan ----------

const ulaValue = $('v6-ula-value');
const ulaBox = $('v6-ula-box');
const ownBox = $('v6-own-box');
const ownInput = $('v6-own-input');
const planRows = $('v6-plan-rows');
const planError = $('v6-plan-error');
const planResult = $('v6-plan-result');
const planSize = $('v6-plan-size');
const planUseVlan = $('v6-plan-usevlan');

let ulaNetwork = 0n;
let planExport = null;
let lastPlan = null;

// RFC 4193: fd + 40 random bits, giving a private /48 nobody else is likely to pick.
function generateUla() {
  const bytes = new Uint8Array(5);
  crypto.getRandomValues(bytes);
  let rand = 0n;
  bytes.forEach((b) => { rand = (rand << 8n) | BigInt(b); });
  ulaNetwork = (0xfdn << 120n) | (rand << 80n);
  ulaValue.textContent = `${compressIPv6(ulaNetwork)}/48`;
}

// Keeps step 3 honest about step 1: disables any subnet size that wouldn't fit
// inside the current base prefix, so picking an invalid combination (like /48
// subnets inside a /48 base) is caught before "Generar mi plan", not after.
const planSizeHint = $('v6-plan-size-hint');

function currentBasePrefixForPlan() {
  if (document.querySelector('input[name="v6-source"]:checked').value === 'ula') return 48;
  try {
    return parseIPv6Cidr(ownInput.value).prefix;
  } catch {
    return null;
  }
}

function updateSizeOptions() {
  const basePrefix = currentBasePrefixForPlan();

  if (basePrefix === null) {
    Array.from(planSize.options).forEach((opt) => { opt.disabled = false; });
    planSizeHint.hidden = true;
    return;
  }

  let anyEnabled = false;
  let firstEnabledValue = null;
  Array.from(planSize.options).forEach((opt) => {
    const disabled = Number(opt.value) <= basePrefix;
    opt.disabled = disabled;
    if (!disabled) {
      anyEnabled = true;
      if (firstEnabledValue === null) firstEnabledValue = opt.value;
    }
  });

  if (planSize.options[planSize.selectedIndex].disabled && firstEnabledValue !== null) {
    planSize.value = firstEnabledValue;
  }

  const isUla = document.querySelector('input[name="v6-source"]:checked').value === 'ula';
  planSizeHint.hidden = false;
  if (!anyEnabled) {
    planSizeHint.className = 'prefix-hint hint-warn';
    planSizeHint.textContent = t('Tu prefijo base es /{base}: ningún tamaño de la lista cabe ahí. Usa un prefijo base más pequeño (número menor) en el paso 1.', { base: basePrefix });
  } else if (isUla) {
    planSizeHint.className = 'prefix-hint hint-info';
    planSizeHint.textContent = t('Una red privada (ULA) siempre es un /48 completo, así que no puedes sacar subredes /48 de adentro de ella (lo que no cabe aparece atenuado). Si de verdad necesitas subredes /48 (por ejemplo, una por sucursal), elige "Ya tengo un prefijo" arriba y escribe un bloque más grande, como /32 o /40.');
  } else {
    planSizeHint.className = 'prefix-hint hint-info';
    planSizeHint.textContent = t('Tu prefijo base es /{base}, así que el tamaño aquí debe ser mayor a ese número; lo que no cabe aparece atenuado.', { base: basePrefix });
  }
}

document.querySelectorAll('input[name="v6-source"]').forEach((radio) => {
  radio.addEventListener('change', () => {
    const own = document.querySelector('input[name="v6-source"]:checked').value === 'own';
    ulaBox.hidden = own;
    ownBox.hidden = !own;
    updateSizeOptions();
  });
});

ownInput.addEventListener('input', updateSizeOptions);

$('v6-ula-regen').addEventListener('click', generateUla);

function addPlanRow(name = '', vlan = '') {
  const div = document.createElement('div');
  div.className = 'plan-row';
  div.innerHTML = `
    <input type="text" class="plan-name" placeholder="Nombre (ej. Usuarios)" autocomplete="off" value="${escapeHtml(name)}" />
    <input type="text" class="plan-vlan" placeholder="VLAN (opcional)" inputmode="numeric" autocomplete="off" value="${escapeHtml(vlan)}" />
    <button type="button" class="btn-tool btn-tool-danger plan-remove" title="Quitar esta subred" aria-label="Quitar">×</button>
  `;
  div.querySelector('.plan-remove').addEventListener('click', () => div.remove());
  planRows.appendChild(div);
}

$('v6-plan-add').addEventListener('click', () => addPlanRow());

function planFail(message) {
  planResult.hidden = true;
  planError.textContent = message;
  planError.hidden = false;
}

$('v6-plan-generate').addEventListener('click', () => {
  planError.hidden = true;
  planResult.hidden = true;

  let base;
  if (document.querySelector('input[name="v6-source"]:checked').value === 'ula') {
    base = { network: ulaNetwork, prefix: 48 };
  } else {
    try {
      const parsed = parseIPv6Cidr(ownInput.value);
      base = { network: networkOf(parsed.value, parsed.prefix), prefix: parsed.prefix };
    } catch (err) {
      planFail(t('Tu prefijo base: {msg}', { msg: err.message }));
      return;
    }
  }

  const size = Number(planSize.value);
  if (size <= base.prefix) {
    planFail(t('El tamaño de cada subred (/{size}) debe ser más pequeño que tu prefijo base (/{base}). Elige otro tamaño arriba o usa un prefijo base más grande.', { size, base: base.prefix }));
    return;
  }

  const entries = Array.from(planRows.querySelectorAll('.plan-row')).map((r, i) => ({
    name: r.querySelector('.plan-name').value.trim() || t('Subred {n}', { n: i + 1 }),
    vlan: r.querySelector('.plan-vlan').value.trim(),
  }));
  if (entries.length === 0) {
    planFail(t('Agrega al menos una subred.'));
    return;
  }

  const capacity = 1n << BigInt(size - base.prefix);
  let indexes;
  if (planUseVlan.checked) {
    const ids = entries.map((e) => Number(e.vlan));
    if (entries.some((e) => !/^\d+$/.test(e.vlan)) || ids.some((n) => n < 1 || n > 4094)) {
      planFail(t('Para usar el número de VLAN como ID de subred, todas las filas necesitan una VLAN entre 1 y 4094 (o desmarca esa opción).'));
      return;
    }
    if (new Set(ids).size !== ids.length) {
      planFail(t('Hay números de VLAN repetidos.'));
      return;
    }
    indexes = ids.map(BigInt);
  } else {
    const offset = capacity > BigInt(entries.length) ? 1 : 0;
    indexes = entries.map((_, i) => BigInt(i + offset));
  }
  if (indexes.some((idx) => idx >= capacity)) {
    planFail(t('No caben: con /{prefix} solo hay {cap} subredes /{size}. Usa un prefijo base más grande o un tamaño de subred más pequeño.', { prefix: base.prefix, cap: dec(groupDigits(capacity)), size }));
    return;
  }

  const step = 1n << BigInt(128 - size);
  const rows = entries.map((entry, i) => {
    const net = base.network + indexes[i] * step;
    return {
      name: entry.name,
      vlan: entry.vlan,
      subnet: `${compressIPv6(net)}/${size}`,
      gateway: compressIPv6(net + 1n),
      range: `${compressIPv6(net)} – ${compressIPv6(lastOf(net, size))}`,
    };
  });

  const baseText = `${compressIPv6(base.network)}/${base.prefix}`;
  const used = BigInt(rows.length);
  const pct = Number((used * 10000n) / capacity) / 100;
  planExport = { rows, baseText };
  lastPlan = { base, size, rows, capacity, baseText, pct };

  paintPlanResult();
});

function paintPlanResult() {
  if (!lastPlan) return;
  const {
    base, size, rows, capacity, baseText, pct,
  } = lastPlan;

  planResult.hidden = false;
  planResult.innerHTML = `
    <div class="plan-summary">
      <div><span class="result-label">Tu prefijo base</span><div class="mono plan-base">${baseText}</div></div>
      <div><span class="result-label">Uso</span><div>${t('{n} de {cap} subredes /{size} ({pct} %)', { n: rows.length, cap: dec(groupDigits(capacity)), size, pct: pct < 0.01 ? dec('<0.01') : dec(String(pct)) })}</div></div>
    </div>
    <div class="bar-block">
      <div class="bar-title">${t('Cómo se reparten los 128 bits de cada dirección')}</div>
      ${anatomy(base.prefix, size)}
    </div>
    <div class="split-table-wrap">
      <table class="split-table">
        <thead><tr><th>Nombre</th><th>VLAN</th><th>Subred</th><th>Gateway sugerido</th><th>Direcciones</th></tr></thead>
        <tbody>
          ${rows.map((r) => `<tr>
            <td>${escapeHtml(r.name)}</td><td>${escapeHtml(r.vlan) || '—'}</td>
            <td class="mono">${r.subnet}</td><td class="mono">${r.gateway}</td><td class="mono">${r.range}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
    <p class="tool-note">Los equipos de cada subred suelen recibir su dirección automáticamente (SLAAC o DHCPv6), así que no hace falta repartir rangos a mano. El gateway sugerido es la primera dirección de cada subred.</p>
    <div class="project-bar">
      <button type="button" id="v6-plan-copy" class="btn-tool">Copiar tabla</button>
      <button type="button" id="v6-plan-csv" class="btn-tool">Exportar CSV</button>
    </div>
  `;

  const planHeaders = () => [t('Nombre'), t('VLAN'), t('Subred'), t('Gateway'), t('Direcciones')];

  $('v6-plan-copy').addEventListener('click', async (e) => {
    const lines = [planHeaders(), ...planExport.rows.map((r) => [r.name, r.vlan, r.subnet, r.gateway, r.range])]
      .map((cols) => cols.map((c) => c.replace(/[\t\r\n]+/g, ' ')).join('\t'));
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      flash(e.target, t('Copiada'));
    } catch {
      planFail(t('No se pudo copiar al portapapeles'));
    }
  });

  $('v6-plan-csv').addEventListener('click', (e) => {
    const cell = (v) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const csv = [planHeaders(), ...planExport.rows.map((r) => [r.name, r.vlan, r.subnet, r.gateway, r.range])]
      .map((cols) => cols.map(cell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'plan-ipv6.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    flash(e.target, t('Descargado'));
  });
}

generateUla();
addPlanRow();
addPlanRow();
updateSizeOptions();

// Re-paint whatever is currently on screen (built with t() at render time, so
// it stays baked in the old language otherwise).
window.addEventListener('ipcalc:lang', () => {
  if (current && !results.hidden) {
    render(current.value, current.prefix);
    if (lastNoPrefix) note.textContent = t('No escribiste prefijo, así que usé /64, el tamaño estándar de una LAN.');
  }
  if (lastSplitPrefix !== null) paintSplitList(lastSplitPrefix);
  if (lastPlan) paintPlanResult();
  if (!planSizeHint.hidden) updateSizeOptions();
});
