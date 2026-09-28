import { isValidIPv4, ipToInt, intToIp, prefixToMaskInt } from './ip-utils.js';
import { MODES } from './modes.js';
import { t, num, dec } from './i18n.js';

const $ = (id) => document.getElementById(id);

const SAVED_SUBNETS_KEY = 'ipcalc.savedSubnets';

const baseIp = $('pl-ip');
const basePrefix = $('pl-prefix');
const modeSelect = $('pl-mode');
const modeInfo = $('pl-mode-info');
const growthSelect = $('pl-growth');
const gwSelect = $('pl-gw');
const rowsBox = $('pl-rows');
const errorBox = $('pl-error');
const resultBox = $('pl-result');

let plan = null;

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

function fail(message) {
  resultBox.hidden = true;
  errorBox.textContent = message;
  errorBox.hidden = false;
}

function warn(message) {
  errorBox.textContent = message;
  errorBox.hidden = false;
}

function reservedTotal(mode) {
  const cfg = MODES[mode];
  return cfg.reservedStart ? cfg.reservedStart + cfg.reservedEnd : 2;
}

// Smallest block (in addresses) that holds `hosts` plus growth margin and the
// mode's reserved addresses. Standard mode also keeps one address for the gateway.
function requiredSize(hosts, mode, growth) {
  const minSize = mode === 'standard' ? 4 : Math.pow(2, 32 - MODES[mode].minPrefix);
  const required = Math.ceil(hosts * (1 + growth / 100)) + reservedTotal(mode) + (mode === 'standard' ? 1 : 0);
  let size = minSize;
  while (size < required) size *= 2;
  return size;
}

function addRow(name = '', vlan = '', hosts = '') {
  const div = document.createElement('div');
  div.className = 'plan-row';
  div.innerHTML = `
    <input type="text" class="plan-name" placeholder="Nombre (ej. Ventas)" autocomplete="off" value="${escapeHtml(name)}" />
    <input type="text" class="plan-vlan" placeholder="VLAN (opcional)" inputmode="numeric" autocomplete="off" value="${escapeHtml(vlan)}" />
    <input type="text" class="plan-hosts" placeholder="Equipos" inputmode="numeric" autocomplete="off" value="${escapeHtml(hosts)}" />
    <button type="button" class="btn-tool btn-tool-danger plan-remove" title="Quitar esta red" aria-label="Quitar">×</button>
  `;
  div.querySelector('.plan-remove').addEventListener('click', () => { div.remove(); updateHint(); });
  rowsBox.appendChild(div);
  updateHint();
}

$('pl-add').addEventListener('click', () => addRow());

function showModeInfo() {
  modeInfo.textContent = MODES[modeSelect.value].info;
  gwSelect.disabled = modeSelect.value !== 'standard';
}
modeSelect.addEventListener('change', showModeInfo);

// Free space left in [start, end) as the fewest aligned CIDR blocks.
function freeBlocks(start, end) {
  const blocks = [];
  let cursor = start;
  while (cursor < end) {
    let size = Math.pow(2, 32);
    while (size > end - cursor || cursor % size !== 0) size /= 2;
    blocks.push({ start: cursor, prefix: 32 - Math.log2(size), size });
    cursor += size;
  }
  return blocks;
}

function subnetDetails(net, prefix, mode, gwPref) {
  const cfg = MODES[mode];
  const size = Math.pow(2, 32 - prefix);
  const broadcast = net + size - 1;
  let firstInt;
  let lastInt;
  if (cfg.reservedStart) {
    firstInt = net + cfg.reservedStart;
    lastInt = broadcast - cfg.reservedEnd;
  } else {
    firstInt = net + 1;
    lastInt = broadcast - 1;
  }
  const usable = lastInt - firstInt + 1;

  let gateway;
  let dhcpStart = null;
  let dhcpEnd = null;
  if (cfg.reservedStart) {
    gateway = net + 1;
    dhcpStart = firstInt;
    dhcpEnd = lastInt;
  } else if (usable > 2) {
    if (gwPref === 'last') {
      gateway = lastInt;
      dhcpStart = firstInt;
      dhcpEnd = lastInt - 1;
    } else {
      gateway = firstInt;
      dhcpStart = firstInt + 1;
      dhcpEnd = lastInt;
    }
  } else {
    gateway = firstInt;
  }
  return { size, usable, firstInt, lastInt, gateway, dhcpStart, dhcpEnd };
}

$('pl-generate').addEventListener('click', () => {
  errorBox.hidden = true;
  resultBox.hidden = true;

  const ip = baseIp.value.trim();
  const prefix = Number(basePrefix.value);
  if (!isValidIPv4(ip)) { fail(t('La red base no es una dirección IPv4 válida.')); return; }
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 30) { fail(t('El prefijo base debe estar entre 0 y 30.')); return; }

  const mode = modeSelect.value;
  const gwPref = gwSelect.value === 'last' ? 'last' : 'first';
  const growth = Number(growthSelect.value);

  const baseStart = (ipToInt(ip) & prefixToMaskInt(prefix)) >>> 0;
  const baseEnd = baseStart + Math.pow(2, 32 - prefix);

  const entries = [];
  const rowEls = Array.from(rowsBox.querySelectorAll('.plan-row'));
  for (let i = 0; i < rowEls.length; i += 1) {
    const r = rowEls[i];
    const hostsText = r.querySelector('.plan-hosts').value.trim();
    const name = r.querySelector('.plan-name').value.trim() || t('Red {n}', { n: i + 1 });
    if (!/^\d+$/.test(hostsText) || Number(hostsText) < 1) {
      fail(t('"{name}": escribe cuántos equipos necesita (un número mayor que 0).', { name }));
      return;
    }
    const hosts = Number(hostsText);
    const size = requiredSize(hosts, mode, growth);
    entries.push({ order: i, name, vlan: r.querySelector('.plan-vlan').value.trim(), hosts, size });
  }
  if (entries.length === 0) { fail(t('Agrega al menos una red.')); return; }

  const sorted = [...entries].sort((a, b) => b.size - a.size || a.order - b.order);
  const totalNeeded = sorted.reduce((sum, e) => sum + e.size, 0);
  if (baseStart + totalNeeded > baseEnd) {
    const suggested = Math.max(0, 32 - Math.ceil(Math.log2(totalNeeded)));
    const shortage = totalNeeded - Math.pow(2, 32 - prefix);
    fail(t('No caben: necesitas {needed} direcciones y /{prefix} solo tiene {have} (faltan {short}). Usa un prefijo base más grande, por ejemplo /{suggested}, o pide menos equipos.', {
      needed: num(totalNeeded), prefix, have: num(Math.pow(2, 32 - prefix)), short: num(shortage), suggested,
    }));
    return;
  }

  let cursor = baseStart;
  const rows = sorted.map((e, idx) => {
    const net = cursor;
    cursor += e.size;
    const p = 32 - Math.log2(e.size);
    return { ...e, net, prefix: p, tone: idx % 8, ...subnetDetails(net, p, mode, gwPref) };
  });
  const free = freeBlocks(cursor, baseEnd);
  const usedSize = cursor - baseStart;
  const baseSize = baseEnd - baseStart;

  plan = {
    rows, mode, gwPref, growth, base: `${intToIp(baseStart)}/${prefix}`, baseStart, prefix, free, baseEnd, cursor, usedSize, baseSize,
  };

  paintResult();
});

function paintResult() {
  const {
    rows, mode, growth, free, baseEnd, cursor, usedSize, baseSize,
  } = plan;

  const pct = (usedSize / baseSize) * 100;
  // The bar is colors only (name and CIDR appear on hover); the legend below spells everything out.
  const bar = rows.map((r) => `<div class="use-seg" style="flex:${r.size};background:var(--c${r.tone})" title="${escapeHtml(r.name)} · ${intToIp(r.net)}/${r.prefix}"></div>`).join('')
    + (free.length ? `<div class="use-seg use-free" style="flex:${baseEnd - cursor}" title="${t('Espacio libre')}"></div>` : '');

  const freeShare = ((baseEnd - cursor) / baseSize) * 100;
  const legend = rows.map((r) => `<span class="legend-item"><span class="swatch" style="background:var(--c${r.tone})"></span><span class="legend-body"><span class="legend-name">${escapeHtml(r.name)}</span><span class="legend-sub"><span class="mono legend-cidr">${intToIp(r.net)}/${r.prefix}</span> <span class="legend-pct">${percent((r.size / baseSize) * 100)} %</span></span></span></span>`).join('')
    + (free.length ? `<span class="legend-item"><span class="swatch swatch-free"></span><span class="legend-body"><span class="legend-name">Libre</span><span class="legend-sub"><span class="legend-pct">${t('{pct} % · {n} direcciones', { pct: percent(freeShare), n: num(baseEnd - cursor) })}</span></span></span></span>` : '');

  resultBox.hidden = false;
  resultBox.innerHTML = `
    <div class="plan-summary">
      <div><span class="result-label">Red base</span><div class="mono plan-base">${plan.base}</div></div>
      <div><span class="result-label">Usado</span><div>${t('{used} de {total} direcciones ({pct} %)', { used: num(usedSize), total: num(baseSize), pct: dec(pct.toFixed(pct < 10 ? 2 : 1)) })}</div></div>
      <div><span class="result-label">Espacio libre</span><div class="mono">${free.length ? free.map((b) => `${intToIp(b.start)}/${b.prefix}`).join(', ') : t('ninguno')}</div></div>
    </div>
    <div class="bar-block">
      <div class="bar-title">Uso de la red base</div>
      <div class="usebar">${bar}</div>
      <div class="use-legend">${legend}</div>
    </div>
    <div class="split-table-wrap">
      <table class="split-table">
        <thead><tr>
          <th>Nombre</th><th>VLAN</th><th>Subred</th><th>Máscara</th><th>Pedidos</th><th>Capacidad</th><th>Gateway</th><th>DHCP</th><th>Rango utilizable</th>
        </tr></thead>
        <tbody>
          ${rows.map((r) => `<tr class="tone-${r.tone}">
            <td>${escapeHtml(r.name)}</td>
            <td>${escapeHtml(r.vlan) || '—'}</td>
            <td class="mono">${intToIp(r.net)}/${r.prefix}</td>
            <td class="mono">${intToIp(prefixToMaskInt(r.prefix))}</td>
            <td>${num(r.hosts)}</td>
            <td>${num(r.usable)}</td>
            <td class="mono">${intToIp(r.gateway)}</td>
            <td class="mono">${r.dhcpStart === null ? '—' : `${intToIp(r.dhcpStart)} – ${intToIp(r.dhcpEnd)}`}</td>
            <td class="mono">${intToIp(r.firstInt)} – ${intToIp(r.lastInt)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
    <p class="tool-note">${t('Las redes se ordenan de la más grande a la más pequeña para que encajen sin dejar huecos.')}${mode === 'standard' ? t(' Cada red incluye una dirección extra para el gateway.') : ''}${growth ? t(' Incluye {n} % de margen de crecimiento.', { n: growth }) : ''}</p>
    <div class="project-bar">
      <button type="button" id="pl-copy" class="btn-tool">Copiar tabla</button>
      <button type="button" id="pl-csv" class="btn-tool">Exportar CSV</button>
      <button type="button" id="pl-send" class="btn-tool">Enviar a calculadora</button>
      <button type="button" id="pl-open" class="btn-tool">Abrir en el divisor</button>
    </div>
    <div id="pl-config-card" class="plan-card"></div>
  `;

  bindActions();
  renderConfigCard();
}

function tableMatrix() {
  const header = [t('Nombre'), t('VLAN'), t('Subred'), t('Máscara'), t('Pedidos'), t('Capacidad'), t('Gateway'), t('DHCP'), t('Rango utilizable')];
  const body = plan.rows.map((r) => [
    r.name, r.vlan, `${intToIp(r.net)}/${r.prefix}`, intToIp(prefixToMaskInt(r.prefix)), String(r.hosts), String(r.usable),
    intToIp(r.gateway), r.dhcpStart === null ? '' : `${intToIp(r.dhcpStart)} – ${intToIp(r.dhcpEnd)}`,
    `${intToIp(r.firstInt)} – ${intToIp(r.lastInt)}`,
  ]);
  return [header, ...body];
}

function bindActions() {
  $('pl-copy').addEventListener('click', async (e) => {
    const text = tableMatrix().map((cols) => cols.map((c) => c.replace(/[\t\r\n]+/g, ' ')).join('\t')).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      flash(e.target, t('Copiada'));
    } catch {
      warn(t('No se pudo copiar al portapapeles'));
    }
  });

  $('pl-csv').addEventListener('click', (e) => {
    const cell = (v) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const csv = tableMatrix().map((cols) => cols.map(cell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'plan-vlsm.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    flash(e.target, t('Descargado'));
  });

  $('pl-send').addEventListener('click', (e) => {
    let saved;
    try { saved = JSON.parse(localStorage.getItem(SAVED_SUBNETS_KEY) || '[]'); } catch { saved = []; }
    if (!Array.isArray(saved)) saved = [];
    const fresh = [];
    plan.rows.forEach((r) => {
      const ip = intToIp(r.net);
      const vlan = r.vlan || r.name;
      if (saved.some((s) => s.ip === ip && s.prefix === r.prefix && (s.vlan || '') === vlan)) return;
      fresh.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, vlan, ip, prefix: r.prefix, gw: plan.gwPref });
    });
    try { localStorage.setItem(SAVED_SUBNETS_KEY, JSON.stringify([...fresh, ...saved])); } catch { /* storage unavailable */ }
    window.dispatchEvent(new Event('ipcalc:saved-changed'));
    flash(e.target, fresh.length ? t('Enviadas ({n})', { n: fresh.length }) : t('Ya estaban'));
  });

  $('pl-open').addEventListener('click', () => {
    const blocks = [
      ...plan.rows.map((r) => ({
        start: r.net, prefix: r.prefix, vlan: r.vlan, label: r.name,
      })),
      ...plan.free.map((b) => ({
        start: b.start, prefix: b.prefix, vlan: '', label: t('Espacio libre'),
      })),
    ];
    const tree = buildSplitTree(plan.baseStart, plan.prefix, blocks);
    window.dispatchEvent(new CustomEvent('ipcalc:show-tab', { detail: 'splitter' }));
    window.dispatchEvent(new CustomEvent('ipcalc:open-splitter', {
      detail: {
        ip: intToIp(plan.baseStart), prefix: plan.prefix, mode: plan.mode, gw: plan.gwPref, tree,
      },
    }));
  });
}

// Rebuilds a splitter-compatible binary tree that reproduces this plan's
// layout: each row and each free gap becomes a leaf at its exact CIDR, and
// every node in between is split so the whole base network tiles perfectly
// (valid because VLSM packing places aligned, decreasing power-of-two blocks).
function buildSplitTree(baseStart, basePrefix, blocks) {
  function build(start, prefix) {
    const match = blocks.find((b) => b.start === start && b.prefix === prefix);
    if (match) {
      return { label: match.label || '', vlan: match.vlan || '', children: null };
    }
    const half = Math.pow(2, 32 - prefix) / 2;
    const childPrefix = prefix + 1;
    return {
      label: '',
      vlan: '',
      children: [build(start, childPrefix), build(start + half, childPrefix)],
    };
  }
  return build(baseStart, basePrefix);
}

// ---------- Device configuration ----------

function safeName(text) {
  return text.replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 30) || 'red';
}

const VENDORS = {
  cisco: {
    label: 'Cisco IOS (switch L3 / router)',
    build: (rows) => rows.map((r) => {
      const v = r.vlan || '<VLAN_ID>';
      const mask = intToIp(prefixToMaskInt(r.prefix));
      const lines = [
        `! ${r.name} (${intToIp(r.net)}/${r.prefix})`,
        `vlan ${v}`,
        ` name ${safeName(r.name)}`,
        '!',
        `interface Vlan${v}`,
        ` description ${r.name}`,
        ` ip address ${intToIp(r.gateway)} ${mask}`,
        ' no shutdown',
        '!',
      ];
      if (r.dhcpStart !== null) {
        lines.push(
          `ip dhcp excluded-address ${intToIp(r.gateway)}`,
          `ip dhcp pool ${safeName(r.name)}`,
          ` network ${intToIp(r.net)} ${mask}`,
          ` default-router ${intToIp(r.gateway)}`,
          '!',
        );
      }
      return lines.join('\n');
    }).join('\n'),
  },
  mikrotik: {
    label: 'MikroTik RouterOS',
    build: (rows) => rows.map((r) => {
      const n = safeName(r.name);
      const iface = `vlan${r.vlan || 'X'}-${n}`;
      const lines = [
        `# ${r.name} (${intToIp(r.net)}/${r.prefix})`,
        `/interface vlan add name=${iface} vlan-id=${r.vlan || '<VLAN_ID>'} interface=${t('<INTERFAZ_TRONCAL>')}`,
        `/ip address add address=${intToIp(r.gateway)}/${r.prefix} interface=${iface} comment="${r.name.replace(/"/g, '')}"`,
      ];
      if (r.dhcpStart !== null) {
        lines.push(
          `/ip pool add name=pool-${n} ranges=${intToIp(r.dhcpStart)}-${intToIp(r.dhcpEnd)}`,
          `/ip dhcp-server add name=dhcp-${n} interface=${iface} address-pool=pool-${n} disabled=no`,
          `/ip dhcp-server network add address=${intToIp(r.net)}/${r.prefix} gateway=${intToIp(r.gateway)}`,
        );
      }
      return lines.join('\n');
    }).join('\n\n'),
  },
  fortigate: {
    label: 'FortiGate (FortiOS)',
    build: (rows) => rows.map((r) => {
      const n = safeName(r.name);
      const iface = `vlan${r.vlan || 'X'}_${n}`.slice(0, 15);
      const mask = intToIp(prefixToMaskInt(r.prefix));
      const lines = [
        `# ${r.name} (${intToIp(r.net)}/${r.prefix})`,
        'config system interface',
        `    edit "${iface}"`,
        '        set vdom "root"',
        `        set ip ${intToIp(r.gateway)} ${mask}`,
        '        set allowaccess ping',
        `        set alias "${r.name.replace(/"/g, '')}"`,
        `        set interface "${t('<INTERFAZ_FISICA>')}"`,
        `        set vlanid ${r.vlan || '<VLAN_ID>'}`,
        '    next',
        'end',
      ];
      if (r.dhcpStart !== null) {
        lines.push(
          'config system dhcp server',
          '    edit 0',
          `        set interface "${iface}"`,
          `        set default-gateway ${intToIp(r.gateway)}`,
          `        set netmask ${mask}`,
          '        config ip-range',
          '            edit 1',
          `                set start-ip ${intToIp(r.dhcpStart)}`,
          `                set end-ip ${intToIp(r.dhcpEnd)}`,
          '            next',
          '        end',
          '    next',
          'end',
        );
      }
      return lines.join('\n');
    }).join('\n\n'),
  },
  linux: {
    label: 'Linux (iproute2 + dnsmasq)',
    build: (rows) => {
      const cmds = rows.map((r) => {
        const dev = `<IFACE>.${r.vlan || '<VLAN_ID>'}`;
        return [
          `# ${r.name} (${intToIp(r.net)}/${r.prefix})`,
          `ip link add link <IFACE> name ${dev} type vlan id ${r.vlan || '<VLAN_ID>'}`,
          `ip addr add ${intToIp(r.gateway)}/${r.prefix} dev ${dev}`,
          `ip link set ${dev} up`,
        ].join('\n');
      });
      const dhcp = rows.filter((r) => r.dhcpStart !== null).map((r) => `dhcp-range=set:${safeName(r.name)},${intToIp(r.dhcpStart)},${intToIp(r.dhcpEnd)},${intToIp(prefixToMaskInt(r.prefix))},12h\ndhcp-option=tag:${safeName(r.name)},option:router,${intToIp(r.gateway)}`);
      return `${cmds.join('\n\n')}\n\n# --- /etc/dnsmasq.conf ---\n${dhcp.join('\n')}`;
    },
  },
};

function renderConfigCard() {
  const card = $('pl-config-card');
  if (plan.mode !== 'standard') {
    card.innerHTML = `
      <h3>Configuración para equipos</h3>
      <p class="tool-note">${t('En AWS, Azure y OCI las subredes se crean desde la consola, la CLI o Terraform con su bloque CIDR (columna "Subred"), y el gateway y el DHCP los gestiona la nube. Por eso aquí solo se genera configuración en modo Estándar.')}</p>`;
    return;
  }
  card.innerHTML = `
    <h3>Configuración para equipos</h3>
    <div class="config-bar">
      <select id="pl-vendor" aria-label="Fabricante">
        ${Object.entries(VENDORS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}
      </select>
      <button type="button" id="pl-config-copy" class="btn-tool">Copiar configuración</button>
    </div>
    <pre id="pl-config" class="tool-pre config-pre"></pre>
    <p class="tool-note">Los textos entre &lt; &gt; (interfaz, VLAN sin definir) son datos que debes completar. Revisa siempre la configuración antes de aplicarla.</p>
  `;
  const show = () => { $('pl-config').textContent = VENDORS[$('pl-vendor').value].build(plan.rows); };
  $('pl-vendor').addEventListener('change', show);
  $('pl-config-copy').addEventListener('click', async (e) => {
    try {
      await navigator.clipboard.writeText($('pl-config').textContent);
      flash(e.target, t('Copiada'));
    } catch {
      warn(t('No se pudo copiar al portapapeles'));
    }
  });
  show();
}

// ---------- Live prefix suggestion ----------

const hintBox = $('pl-hint');
const hintText = $('pl-hint-text');
const hintApply = $('pl-hint-apply');
let suggestedPrefix = null;

function percent(value) {
  return dec(value.toFixed(value < 10 ? 1 : 0));
}

function updateHint() {
  const mode = modeSelect.value;
  const growth = Number(growthSelect.value);
  let total = 0;
  rowsBox.querySelectorAll('.plan-hosts').forEach((input) => {
    const text = input.value.trim();
    if (/^\d+$/.test(text) && Number(text) >= 1) total += requiredSize(Number(text), mode, growth);
  });

  hintBox.hidden = false;
  hintBox.className = 'prefix-hint';
  hintApply.hidden = true;
  suggestedPrefix = null;

  if (total === 0) {
    hintText.textContent = t('Escribe cuántos equipos necesita cada red y te sugiero qué prefijo base usar.');
    return;
  }

  const needed = Math.max(0, 32 - Math.ceil(Math.log2(total)));
  const prefix = Number(basePrefix.value);
  if (!Number.isInteger(prefix)) return;
  const usage = (total / Math.pow(2, 32 - prefix)) * 100;
  const sizeText = num(total);

  if (prefix > needed) {
    hintBox.classList.add('hint-warn');
    hintText.textContent = t('Con /{prefix} no caben: tus redes necesitan {total} direcciones y necesitas al menos /{needed} (cuanto más pequeño el número, más grande la red).', { prefix, total: sizeText, needed });
    suggestedPrefix = needed;
  } else if (prefix === needed) {
    hintBox.classList.add('hint-ok');
    hintText.textContent = t('/{prefix} es justo lo necesario: usarías el {pct} % ({total} direcciones). Si esperas crecer, considera /{bigger}.', { prefix, pct: percent(usage), total: sizeText, bigger: Math.max(prefix - 1, 0) });
  } else if (prefix === needed - 1) {
    hintBox.classList.add('hint-ok');
    hintText.textContent = t('/{prefix} deja margen para crecer: usarías el {pct} % ({total} de {cap} direcciones).', { prefix, pct: percent(usage), total: sizeText, cap: num(Math.pow(2, 32 - prefix)) });
  } else {
    hintBox.classList.add('hint-info');
    hintText.textContent = t('/{prefix} es mucho más grande de lo necesario: solo usarías el {pct} % ({total} direcciones). Con /{needed} alcanza; deja /{prefix} solo si planeas crecer mucho.', { prefix, pct: percent(usage), total: sizeText, needed });
    suggestedPrefix = needed;
  }

  if (suggestedPrefix !== null) {
    hintApply.textContent = t('Usar /{n}', { n: suggestedPrefix });
    hintApply.hidden = false;
  }
}

hintApply.addEventListener('click', () => {
  if (suggestedPrefix === null) return;
  basePrefix.value = String(suggestedPrefix);
  updateHint();
});

rowsBox.addEventListener('input', updateHint);
basePrefix.addEventListener('input', updateHint);
growthSelect.addEventListener('change', updateHint);
modeSelect.addEventListener('change', updateHint);

showModeInfo();
addRow('Usuarios', '10', '250');
addRow('Servidores', '20', '60');
addRow('Voz', '30', '100');
addRow('Invitados', '40', '120');
addRow('Administración', '50', '12');

// Re-paint the currently shown plan (built with t() at render time, so it
// stays baked in the old language otherwise).
window.addEventListener('ipcalc:lang', () => {
  showModeInfo();
  updateHint();
  if (plan && !resultBox.hidden) paintResult();
});
