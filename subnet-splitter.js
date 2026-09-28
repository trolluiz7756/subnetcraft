import { isValidIPv4, ipToInt, intToIp, prefixToMaskInt } from './ip-utils.js';
import { renderPng, renderSvg, downloadBlob } from './splitter-image.js';
import { MODES } from './modes.js';
import { t, num, getLang } from './i18n.js';

const baseForm = document.getElementById('split-form');
const baseIpInput = document.getElementById('split-ip');
const basePrefixInput = document.getElementById('split-prefix');
const errorBox = document.getElementById('split-error');
const tableBody = document.getElementById('split-table-body');
const treeHeadCell = document.getElementById('tree-head-cell');
const resetBtn = document.getElementById('split-reset');
const modeSelect = document.getElementById('split-mode');
const modeInfo = document.getElementById('split-mode-info');
const gwSelect = document.getElementById('split-gw');
const projectName = document.getElementById('project-name');
const projectSaveBtn = document.getElementById('project-save');
const projectList = document.getElementById('project-list');
const projectLoadBtn = document.getElementById('project-load');
const projectDeleteBtn = document.getElementById('project-delete');
const exportCopyBtn = document.getElementById('export-copy');
const exportCsvBtn = document.getElementById('export-csv');
const exportPngBtn = document.getElementById('export-png');
const exportSvgBtn = document.getElementById('export-svg');
const exportCopyImgBtn = document.getElementById('export-copy-img');
const sendCalcBtn = document.getElementById('send-calc');
const shareBtn = document.getElementById('share-link');

const PROJECTS_KEY = 'ipcalc.projects';
const DRAFT_KEY = 'ipcalc.splitterDraft';
const SAVED_SUBNETS_KEY = 'ipcalc.savedSubnets';

let mode = 'standard';
let previousMode = 'standard';
let gwPref = 'first';
let root = null;
let idCounter = 0;

function minPrefix() {
  return MODES[mode].minPrefix;
}

function maxRootPrefix() {
  return Math.min(minPrefix(), 30);
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function storageGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function storageSet(key, value) {
  try { localStorage.setItem(key, value); } catch { /* storage unavailable */ }
}

const TONE_COUNT = 8;

function toneClass(node) {
  return `tone-${node.prefix % TONE_COUNT}`;
}

function createNode(networkInt, prefix, parent) {
  idCounter += 1;
  return { id: idCounter, networkInt, prefix, label: '', vlan: '', parent, children: null };
}

function splitNode(node) {
  if (node.prefix >= minPrefix()) return;
  const size = Math.pow(2, 32 - node.prefix);
  const half = size / 2;
  const left = createNode(node.networkInt, node.prefix + 1, node);
  const right = createNode(node.networkInt + half, node.prefix + 1, node);
  node.children = [left, right];
}

function countDescendantLeaves(node) {
  if (!node.children) return 1;
  return countDescendantLeaves(node.children[0]) + countDescendantLeaves(node.children[1]);
}

function joinNode(node) {
  const leaves = countDescendantLeaves(node);
  if (leaves > 2 && !window.confirm(t('Este nodo tiene {n} subredes debajo. ¿Unirlas todas en una sola?', { n: leaves }))) {
    return;
  }
  node.children = null;
}

function getLeaves(node, out = []) {
  if (!node.children) {
    out.push(node);
  } else {
    getLeaves(node.children[0], out);
    getLeaves(node.children[1], out);
  }
  return out;
}

function subnetInfo(node) {
  const size = Math.pow(2, 32 - node.prefix);
  const broadcastInt = node.networkInt + size - 1;
  const cfg = MODES[mode];
  let usable, firstInt, lastInt;
  if (cfg.reservedStart) {
    usable = size - cfg.reservedStart - cfg.reservedEnd;
    firstInt = node.networkInt + cfg.reservedStart;
    lastInt = broadcastInt - cfg.reservedEnd;
  } else if (node.prefix === 32) {
    usable = 1;
    firstInt = node.networkInt;
    lastInt = node.networkInt;
  } else if (node.prefix === 31) {
    usable = 2;
    firstInt = node.networkInt;
    lastInt = broadcastInt;
  } else {
    usable = size - 2;
    firstInt = node.networkInt + 1;
    lastInt = broadcastInt - 1;
  }

  // Cloud modes reserve network + 1 as the gateway, so the whole usable range
  // is available for DHCP. In standard mode the gateway is the first or last
  // usable IP (per the selector) and DHCP is what remains; blocks with 2 or
  // fewer usable hosts are too small to split.
  let gateway = null;
  let dhcp = null;
  if (cfg.reservedStart) {
    gateway = intToIp(node.networkInt + 1);
    if (usable >= 1) dhcp = `${intToIp(firstInt)} – ${intToIp(lastInt)}`;
  } else if (usable > 2) {
    if (gwPref === 'last') {
      gateway = intToIp(lastInt);
      dhcp = `${intToIp(firstInt)} – ${intToIp(lastInt - 1)}`;
    } else {
      gateway = intToIp(firstInt);
      dhcp = `${intToIp(firstInt + 1)} – ${intToIp(lastInt)}`;
    }
  }

  return {
    cidr: `${intToIp(node.networkInt)}/${node.prefix}`,
    network: intToIp(node.networkInt),
    broadcast: intToIp(broadcastInt),
    mask: intToIp(prefixToMaskInt(node.prefix)),
    firstHost: intToIp(firstInt),
    lastHost: intToIp(lastInt),
    total: size,
    usable,
    gateway,
    dhcp,
  };
}

// Assigns each node the row index of its leftmost descendant leaf (where its
// tree cell starts) and how many leaf rows it spans (its rowspan).
function annotate(node, rowOffset) {
  if (!node.children) {
    node.firstLeafIndex = rowOffset;
    node.leafCount = 1;
    return 1;
  }
  const leftCount = annotate(node.children[0], rowOffset);
  const rightCount = annotate(node.children[1], rowOffset + leftCount);
  node.firstLeafIndex = rowOffset;
  node.leafCount = leftCount + rightCount;
  return node.leafCount;
}

function maxPrefixIn(node) {
  if (!node.children) return node.prefix;
  return Math.max(maxPrefixIn(node.children[0]), maxPrefixIn(node.children[1]));
}

function render() {
  const leaves = getLeaves(root);
  annotate(root, 0);
  const maxPrefix = maxPrefixIn(root);
  treeHeadCell.colSpan = maxPrefix - root.prefix + 1;

  tableBody.innerHTML = '';

  leaves.forEach((leaf, rowIndex) => {
    const info = subnetInfo(leaf);
    const tr = document.createElement('tr');
    tr.className = toneClass(leaf);
    tr.innerHTML = `
      <td class="mono">${info.cidr}</td>
      <td class="mono">${info.network} – ${info.broadcast}</td>
      <td class="mono">${info.firstHost} – ${info.lastHost}</td>
      <td>${num(info.usable)}</td>
      <td><input type="text" class="vlan-input" placeholder="VLAN" value="${escapeHtml(leaf.vlan)}" /></td>
      <td class="mono">${info.gateway || '—'}</td>
      <td class="mono">${info.dhcp || '—'}</td>
      <td><input type="text" class="note-input" placeholder="Nota" value="${escapeHtml(leaf.label)}" /></td>
    `;
    tr.querySelector('.vlan-input').addEventListener('input', (e) => {
      leaf.vlan = e.target.value;
      saveDraft();
    });
    tr.querySelector('.note-input').addEventListener('input', (e) => {
      leaf.label = e.target.value;
      saveDraft();
    });

    // Walk up from this leaf toward the root collecting every ancestor whose
    // span starts exactly at this row. Appended leaf-first, so the largest
    // network (root) sits rightmost and splits grow toward the left.
    const treeCells = [];
    let cursor = leaf;
    while (cursor && cursor.firstLeafIndex === rowIndex) {
      const node = cursor;
      const isLeaf = !node.children;
      const td = document.createElement('td');
      td.textContent = `/${node.prefix}`;
      td.rowSpan = node.leafCount;
      const tone = toneClass(node);

      if (isLeaf) {
        td.colSpan = maxPrefix - node.prefix + 1;
        if (node.prefix < minPrefix()) {
          td.className = `tree-cell tree-split ${tone}`;
          td.title = t('Clic para dividir esta subred');
          td.addEventListener('click', () => { splitNode(node); render(); });
        } else {
          td.className = `tree-cell tree-disabled ${tone}`;
          td.title = t('Tamaño mínimo del modo: /{n}', { n: minPrefix() });
        }
      } else {
        td.className = `tree-cell tree-join ${tone}`;
        td.title = t('Clic para unir esta subred');
        td.addEventListener('click', () => { joinNode(node); render(); });
      }

      treeCells.push(td);
      cursor = cursor.parent;
    }
    treeCells.forEach((td) => tr.appendChild(td));

    tableBody.appendChild(tr);
  });

  saveDraft();
}

// ---------- Persistence (draft autosave + named projects) ----------

function serializeNode(node) {
  return {
    label: node.label,
    vlan: node.vlan,
    children: node.children ? node.children.map(serializeNode) : null,
  };
}

function serializeState() {
  return {
    ip: intToIp(root.networkInt),
    prefix: root.prefix,
    mode,
    gw: gwPref,
    tree: serializeNode(root),
  };
}

function applyTree(node, data) {
  if (!data) return;
  node.label = typeof data.label === 'string' ? data.label : '';
  node.vlan = typeof data.vlan === 'string' ? data.vlan : '';
  if (Array.isArray(data.children) && data.children.length === 2) {
    splitNode(node);
    if (node.children) {
      applyTree(node.children[0], data.children[0]);
      applyTree(node.children[1], data.children[1]);
    }
  }
}

function syncControls() {
  modeSelect.value = mode;
  gwSelect.value = gwPref;
  gwSelect.disabled = mode !== 'standard';
  modeInfo.textContent = MODES[mode].info;
}

function applyState(state) {
  if (!state || typeof state.ip !== 'string' || !isValidIPv4(state.ip) || !MODES[state.mode]) return false;
  const prefix = Number(state.prefix);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > Math.min(MODES[state.mode].minPrefix, 30)) return false;

  mode = state.mode;
  previousMode = mode;
  gwPref = state.gw === 'last' ? 'last' : 'first';
  syncControls();

  baseIpInput.value = state.ip;
  basePrefixInput.value = String(prefix);
  const networkInt = (ipToInt(state.ip) & prefixToMaskInt(prefix)) >>> 0;
  root = createNode(networkInt, prefix, null);
  applyTree(root, state.tree);
  render();
  return true;
}

function saveDraft() {
  if (!root) return;
  storageSet(DRAFT_KEY, JSON.stringify(serializeState()));
}

function loadProjects() {
  try {
    const list = JSON.parse(storageGet(PROJECTS_KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function refreshProjectList(selectedId = '') {
  const projects = loadProjects();
  projectList.innerHTML = `<option value="">${t('Proyectos guardados…')}</option>`;
  projects.forEach((p) => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name;
    projectList.appendChild(opt);
  });
  projectList.value = selectedId;
}

function showError(message) {
  errorBox.textContent = message;
  errorBox.hidden = false;
}

projectSaveBtn.addEventListener('click', () => {
  errorBox.hidden = true;
  const name = projectName.value.trim();
  if (!name) {
    showError(t('Escribe un nombre para guardar el proyecto'));
    return;
  }
  const projects = loadProjects();
  const existing = projects.find((p) => p.name.toLowerCase() === name.toLowerCase());
  const data = serializeState();
  let id;
  if (existing) {
    existing.name = name;
    existing.data = data;
    existing.updatedAt = Date.now();
    id = existing.id;
  } else {
    id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    projects.unshift({ id, name, data, updatedAt: Date.now() });
  }
  storageSet(PROJECTS_KEY, JSON.stringify(projects));
  refreshProjectList(id);

  const original = projectSaveBtn.textContent;
  projectSaveBtn.textContent = t('Guardado');
  setTimeout(() => { projectSaveBtn.textContent = original; }, 1200);
});

projectLoadBtn.addEventListener('click', () => {
  errorBox.hidden = true;
  const project = loadProjects().find((p) => p.id === projectList.value);
  if (!project) {
    showError(t('Elige un proyecto de la lista'));
    return;
  }
  if (!applyState(project.data)) {
    showError(t('No se pudo cargar el proyecto (datos inválidos)'));
    return;
  }
  projectName.value = project.name;
});

projectDeleteBtn.addEventListener('click', () => {
  errorBox.hidden = true;
  const projects = loadProjects();
  const project = projects.find((p) => p.id === projectList.value);
  if (!project) {
    showError(t('Elige un proyecto de la lista'));
    return;
  }
  if (!window.confirm(t('¿Eliminar el proyecto "{name}"?', { name: project.name }))) return;
  storageSet(PROJECTS_KEY, JSON.stringify(projects.filter((p) => p.id !== project.id)));
  refreshProjectList();
});

// ---------- Export ----------

function exportHeaders() {
  return [
    t('Subred'), t('Máscara'), t('Red'), 'Broadcast', t('Primera IP útil'), t('Última IP útil'),
    t('Hosts'), t('VLAN'), t('Gateway'), t('DHCP'), t('Nota'),
  ];
}

function exportRows() {
  return getLeaves(root).map((leaf) => {
    const info = subnetInfo(leaf);
    return [
      info.cidr, info.mask, info.network, info.broadcast, info.firstHost, info.lastHost,
      String(info.usable), leaf.vlan, info.gateway || '', info.dhcp || '', leaf.label,
    ];
  });
}

function flashButton(btn, text) {
  const original = btn.textContent;
  btn.textContent = text;
  setTimeout(() => { btn.textContent = original; }, 1200);
}

exportCopyBtn.addEventListener('click', async () => {
  const lines = [exportHeaders(), ...exportRows()].map((row) => row.map((c) => c.replace(/[\t\r\n]+/g, ' ')).join('\t'));
  try {
    await navigator.clipboard.writeText(lines.join('\n'));
    flashButton(exportCopyBtn, t('Copiada'));
  } catch {
    showError(t('No se pudo copiar al portapapeles'));
  }
});

function csvCell(value) {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

exportCsvBtn.addEventListener('click', () => {
  const csv = [exportHeaders(), ...exportRows()].map((row) => row.map(csvCell).join(',')).join('\r\n');
  // BOM so Excel reads the file as UTF-8.
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${fileBase()}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  flashButton(exportCsvBtn, t('Descargado'));
});

function fileBase() {
  return (projectName.value.trim() || 'segmentacion').replace(/[^\w\-. ]+/g, '_');
}

// ---------- High-quality image export ----------

function buildImageModel() {
  const leaves = getLeaves(root);
  annotate(root, 0);
  const maxPrefix = maxPrefixIn(root);

  const rows = leaves.map((leaf) => {
    const info = subnetInfo(leaf);
    return [
      info.cidr,
      `${info.network} – ${info.broadcast}`,
      `${info.firstHost} – ${info.lastHost}`,
      num(info.usable),
      leaf.vlan,
      info.gateway || '—',
      info.dhcp || '—',
      leaf.label,
    ];
  });

  const cells = [];
  leaves.forEach((leaf, rowIndex) => {
    let cursor = leaf;
    while (cursor && cursor.firstLeafIndex === rowIndex) {
      const isLeaf = !cursor.children;
      cells.push({
        row: rowIndex,
        col: isLeaf ? 0 : maxPrefix - cursor.prefix,
        colSpan: isLeaf ? maxPrefix - cursor.prefix + 1 : 1,
        rowSpan: cursor.leafCount,
        text: `/${cursor.prefix}`,
        tone: cursor.prefix % TONE_COUNT,
      });
      cursor = cursor.parent;
    }
  });

  const name = projectName.value.trim();
  const rootCidr = `${intToIp(root.networkInt)}/${root.prefix}`;
  const modeLabel = modeSelect.options[modeSelect.selectedIndex].text;
  return {
    title: name ? `${name} — ${rootCidr}` : t('Segmentación {cidr}', { cidr: rootCidr }),
    subtitle: t('Modo {mode} · {n} subredes · {date}', { mode: modeLabel, n: leaves.length, date: new Date().toLocaleDateString(getLang()) }),
    headers: [t('Subred'), t('Rango de direcciones'), t('IPs utilizables'), t('Hosts'), t('VLAN'), t('Gateway'), t('DHCP'), t('Nota')],
    mono: [true, true, true, false, false, true, true, false],
    rows,
    tones: leaves.map((leaf) => leaf.prefix % TONE_COUNT),
    tree: { cols: maxPrefix - root.prefix + 1, header: t('Árbol de subredes'), cells },
  };
}

exportPngBtn.addEventListener('click', async () => {
  errorBox.hidden = true;
  exportPngBtn.disabled = true;
  try {
    const { blob, width, height } = await renderPng(buildImageModel(), 4);
    downloadBlob(blob, `${fileBase()}.png`);
    flashButton(exportPngBtn, `${width}×${height}px`);
  } catch (err) {
    showError(err.message);
  } finally {
    exportPngBtn.disabled = false;
  }
});

exportSvgBtn.addEventListener('click', async () => {
  errorBox.hidden = true;
  try {
    downloadBlob(await renderSvg(buildImageModel()), `${fileBase()}.svg`);
    flashButton(exportSvgBtn, t('Descargado'));
  } catch (err) {
    showError(err.message);
  }
});

exportCopyImgBtn.addEventListener('click', async () => {
  errorBox.hidden = true;
  if (!navigator.clipboard || !window.ClipboardItem) {
    showError(t('Tu navegador no permite copiar imágenes. Usa "Descargar PNG".'));
    return;
  }
  exportCopyImgBtn.disabled = true;
  try {
    // The blob is passed as a promise so browsers that require a synchronous
    // ClipboardItem (Safari) still accept it after the async render.
    const item = new ClipboardItem({ 'image/png': renderPng(buildImageModel(), 3).then((r) => r.blob) });
    await navigator.clipboard.write([item]);
    flashButton(exportCopyImgBtn, t('Imagen copiada'));
  } catch (err) {
    showError(t('No se pudo copiar la imagen ({err}). Usa "Descargar PNG".', { err: err.message }));
  } finally {
    exportCopyImgBtn.disabled = false;
  }
});

// ---------- Send to calculator / open from calculator ----------

sendCalcBtn.addEventListener('click', () => {
  let saved;
  try { saved = JSON.parse(storageGet(SAVED_SUBNETS_KEY) || '[]'); } catch { saved = []; }
  if (!Array.isArray(saved)) saved = [];

  const fresh = [];
  getLeaves(root).forEach((leaf) => {
    const ip = intToIp(leaf.networkInt);
    const vlan = leaf.vlan.trim();
    if (saved.some((s) => s.ip === ip && s.prefix === leaf.prefix && (s.vlan || '') === vlan)) return;
    fresh.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      vlan, ip, prefix: leaf.prefix, gw: gwPref,
    });
  });
  storageSet(SAVED_SUBNETS_KEY, JSON.stringify([...fresh, ...saved]));
  window.dispatchEvent(new Event('ipcalc:saved-changed'));
  flashButton(sendCalcBtn, fresh.length ? t('Enviadas ({n})', { n: fresh.length }) : t('Ya estaban'));
});

window.addEventListener('ipcalc:open-splitter', (e) => {
  const d = e.detail || {};
  if (d.tree) {
    // Comes from the VLSM planner: rebuild the full split tree instead of
    // just the base network, so the divisor already shows every subnet.
    applyState({
      ip: d.ip, prefix: d.prefix, mode: d.mode || 'standard', gw: d.gw || 'first', tree: d.tree,
    });
    return;
  }
  baseIpInput.value = d.ip;
  basePrefixInput.value = String(d.prefix);
  baseForm.dispatchEvent(new Event('submit', { cancelable: true }));
});

// ---------- Shareable link (state packed into the URL hash) ----------

function toBase64Url(str) {
  let bin = '';
  new TextEncoder().encode(str).forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(str) {
  const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

function compactTree(node, bits, data) {
  if (node.children) {
    bits.push('1');
    node.children.forEach((child) => compactTree(child, bits, data));
  } else {
    bits.push('0');
    data.push([node.vlan || '', node.label || '']);
  }
}

// depth is bounded to IPv4's 32 prefix levels, and the node count to a generous
// but finite cap, so a tampered share link can't force unbounded recursion
// (stack exhaustion) or an oversized tree (memory/DOM exhaustion) in whoever opens it.
const MAX_TREE_NODES = 65536;

function expandTree(bits, data, depth = 0, counter = { n: 0 }) {
  counter.n += 1;
  if (counter.n > MAX_TREE_NODES) throw new Error('tree too large');
  if (depth > 32) throw new Error('tree too deep');
  const kind = bits.shift();
  if (kind === '1') {
    return {
      label: '',
      vlan: '',
      children: [expandTree(bits, data, depth + 1, counter), expandTree(bits, data, depth + 1, counter)],
    };
  }
  if (kind !== '0') throw new Error('invalid tree');
  const [vlan, label] = data.shift() || ['', ''];
  return { label, vlan, children: null };
}

function buildShareUrl() {
  const state = serializeState();
  const bits = [];
  const data = [];
  compactTree(state.tree, bits, data);
  const payload = { i: state.ip, p: state.prefix, m: state.mode, g: state.gw === 'last' ? 'l' : 'f', t: bits.join('') };
  if (data.some(([v, l]) => v || l)) payload.d = data;
  return `${location.origin}${location.pathname}#s=${toBase64Url(JSON.stringify(payload))}`;
}

function stateFromHash() {
  const m = location.hash.match(/^#s=([\w-]+)/);
  if (!m) return null;
  try {
    const p = JSON.parse(fromBase64Url(m[1]));
    if (typeof p.t !== 'string') return null;
    return {
      ip: p.i, prefix: p.p, mode: p.m, gw: p.g === 'l' ? 'last' : 'first',
      tree: expandTree(p.t.split(''), Array.isArray(p.d) ? p.d.slice() : []),
    };
  } catch {
    return null;
  }
}

shareBtn.addEventListener('click', async () => {
  const url = buildShareUrl();
  try {
    await navigator.clipboard.writeText(url);
    flashButton(shareBtn, t('Enlace copiado'));
  } catch {
    window.prompt(t('Copia este enlace:'), url);
  }
});

// ---------- Form controls ----------

baseForm.addEventListener('submit', (e) => {
  e.preventDefault();
  errorBox.hidden = true;
  const ip = baseIpInput.value.trim();
  const prefix = Number(basePrefixInput.value);

  if (!isValidIPv4(ip)) {
    showError(t('Dirección IP base inválida'));
    return;
  }
  if (Number.isNaN(prefix) || prefix < 0 || prefix > maxRootPrefix()) {
    showError(t('El prefijo base debe estar entre 0 y {n}', { n: maxRootPrefix() }));
    return;
  }

  const maskInt = prefixToMaskInt(prefix);
  const networkInt = (ipToInt(ip) & maskInt) >>> 0;
  root = createNode(networkInt, prefix, null);
  render();
});

resetBtn.addEventListener('click', () => {
  if (!root) return;
  if (root.children && !window.confirm(t('Esto eliminará todas las divisiones. ¿Continuar?'))) return;
  root.children = null;
  root.label = '';
  root.vlan = '';
  render();
});

function pruneBeyond(node, limit) {
  if (!node.children) return false;
  if (node.prefix >= limit) {
    node.children = null;
    return true;
  }
  const a = pruneBeyond(node.children[0], limit);
  const b = pruneBeyond(node.children[1], limit);
  return a || b;
}

function exceedsLimit(node, limit) {
  if (!node.children) return false;
  if (node.prefix >= limit) return true;
  return exceedsLimit(node.children[0], limit) || exceedsLimit(node.children[1], limit);
}

modeSelect.addEventListener('change', () => {
  const next = modeSelect.value;
  const limit = MODES[next].minPrefix;

  if (root && root.prefix > Math.min(limit, 30)) {
    showError(t('La red base /{prefix} es más pequeña que el mínimo de {mode} (/{limit}). Genera una red más grande primero.', { prefix: root.prefix, mode: next.toUpperCase(), limit }));
    modeSelect.value = previousMode;
    return;
  }
  if (root && exceedsLimit(root, limit)
      && !window.confirm(t('El modo {mode} no permite subredes menores a /{limit}. Se unirán las divisiones más pequeñas. ¿Continuar?', { mode: next.toUpperCase(), limit }))) {
    modeSelect.value = previousMode;
    return;
  }

  errorBox.hidden = true;
  mode = next;
  previousMode = next;
  if (root) pruneBeyond(root, limit);
  syncControls();
  if (root) render();
});

gwSelect.addEventListener('change', () => {
  gwPref = gwSelect.value === 'last' ? 'last' : 'first';
  if (root) render();
});

// Re-paint dynamically generated text (tree cell titles, table, project list
// placeholder) in the new language; static markup is handled by i18n.js itself.
window.addEventListener('ipcalc:lang', () => {
  syncControls();
  refreshProjectList(projectList.value);
  if (root) render();
});

// ---------- Init ----------

syncControls();
refreshProjectList();

let restored = false;
try {
  restored = applyState(stateFromHash()) || applyState(JSON.parse(storageGet(DRAFT_KEY) || 'null'));
} catch {
  restored = false;
}

if (!restored) {
  baseIpInput.value = '10.0.0.0';
  basePrefixInput.value = '16';
  baseForm.dispatchEvent(new Event('submit'));
}
