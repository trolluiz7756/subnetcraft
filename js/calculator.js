import { parseIpAndPrefix, calculateSubnet, intToIp } from './ip-utils.js';
import { bitBarHtml, BIT_COLORS } from './bitbar.js';
import { t, num } from './i18n.js';

const form = document.getElementById('calc-form');
const ipInput = document.getElementById('calc-ip');
const maskInput = document.getElementById('calc-mask');
const vlanInput = document.getElementById('calc-vlan');
const gwSelect = document.getElementById('calc-gw');
const errorBox = document.getElementById('calc-error');
const results = document.getElementById('calc-results');
const toolbar = document.getElementById('calc-toolbar');
const saveBtn = document.getElementById('calc-save');
const shareBtn = document.getElementById('calc-share');
const savedListEl = document.getElementById('saved-list');
const savedEmpty = document.getElementById('saved-empty');

const STORAGE_KEY = 'ipcalc.savedSubnets';
const RECENT_KEY = 'ipcalc.recentIpv4';
const RECENT_MAX = 10;

let lastResult = null;

function loadSaved() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function persistSaved(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* storage unavailable (private mode, quota, etc.) */
  }
}

let savedSubnets = loadSaved();

// ---------- Recent addresses (native <datalist> autocomplete, no UI clutter) ----------

function loadRecent() {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function renderRecent() {
  const dl = document.getElementById('calc-ip-history');
  if (!dl) return;
  dl.innerHTML = loadRecent().map((v) => `<option value="${v.replace(/"/g, '&quot;')}"></option>`).join('');
}

function pushRecent(value) {
  const list = [value, ...loadRecent().filter((v) => v !== value)].slice(0, RECENT_MAX);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch { /* storage unavailable */ }
  renderRecent();
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// Suggests a gateway (first or last usable IP) and the DHCP pool that remains
// after reserving it. Blocks with 2 or fewer usable hosts (/30, /31, /32) are
// too small to split a gateway out of a pool, so no suggestion is made.
function gatewayAndDhcp(data, gwPref) {
  if (data.usableHosts <= 2) return null;

  const firstInt = data.networkInt + 1;
  const lastInt = data.broadcastInt - 1;

  if (gwPref === 'last') {
    return { gateway: intToIp(lastInt), dhcpStart: intToIp(firstInt), dhcpEnd: intToIp(lastInt - 1) };
  }
  return { gateway: intToIp(firstInt), dhcpStart: intToIp(firstInt + 1), dhcpEnd: intToIp(lastInt) };
}

function row(label, value, mono = true) {
  const div = document.createElement('div');
  div.className = 'result-row';
  div.innerHTML = `<span class="result-label">${label}</span><span class="result-value${mono ? ' mono' : ''}" title="Clic para copiar">${value}</span>`;
  return div;
}

function summaryText(data) {
  const kind = data.isPrivate
    ? t('Es una dirección privada o especial: funciona dentro de una red local, no se enruta en Internet.')
    : t('Es una dirección pública: se puede enrutar en Internet.');
  let hosts;
  if (data.prefix === 32) {
    hosts = t('Esta "red" es una sola dirección (un equipo concreto).');
  } else if (data.prefix === 31) {
    hosts = t('Es un enlace punto a punto con 2 direcciones utilizables ({first} y {last}).', { first: data.firstHost, last: data.lastHost });
  } else {
    hosts = t('Esta red admite {hosts} equipos, de {first} a {last}. La primera dirección ({network}) identifica la red y la última ({broadcast}) es el broadcast, así que no se asignan a equipos.', {
      hosts: num(data.usableHosts), first: data.firstHost, last: data.lastHost, network: data.network, broadcast: data.broadcast,
    });
  }
  return t('Tu IP {ip} pertenece a la red {net}/{prefix}. {hosts} {kind}', {
    ip: data.ip, net: data.network, prefix: data.prefix, hosts, kind,
  });
}

function render(data) {
  results.innerHTML = '';
  results.hidden = false;

  const columns = document.createElement('div');
  columns.className = 'results-columns';

  const mainCol = document.createElement('div');
  mainCol.className = 'results-main-col';

  const rows = [
    ['Dirección IP', data.ip],
    ['Máscara de subred', `${data.mask} (/${data.prefix})`],
    ['Wildcard mask', data.wildcard],
    ['Dirección de red', data.network],
    ['Dirección de broadcast', data.broadcast],
    ['Rango de hosts útiles', `${data.firstHost} — ${data.lastHost}`],
    ['Total de direcciones', num(data.totalHosts)],
    ['Hosts utilizables', num(data.usableHosts)],
    ['Clase IP', data.ipClass, false],
    ['Tipo', data.isPrivate ? 'Privada (RFC 1918 / especial)' : 'Pública', false],
  ];
  rows.forEach(([label, value, mono]) => mainCol.appendChild(row(label, value, mono)));

  const binCol = document.createElement('div');
  binCol.className = 'results-binary-col';
  binCol.innerHTML = `
    <div class="binary-section">
      <h3>Representación binaria</h3>
      <div class="result-row"><span class="result-label">IP</span><span class="result-value mono">${data.binary.ip}</span></div>
      <div class="result-row"><span class="result-label">Máscara</span><span class="result-value mono">${data.binary.mask}</span></div>
      <div class="result-row"><span class="result-label">Red</span><span class="result-value mono">${data.binary.network}</span></div>
      <div class="result-row"><span class="result-label">Broadcast</span><span class="result-value mono">${data.binary.broadcast}</span></div>
    </div>
  `;

  columns.appendChild(mainCol);
  columns.appendChild(binCol);

  const summary = document.createElement('div');
  summary.className = 'summary-box';
  summary.innerHTML = `<div class="summary-title">En pocas palabras</div><p>${escapeHtml(summaryText(data))}</p>`;
  results.appendChild(summary);
  results.appendChild(columns);

  const bar = document.createElement('div');
  bar.className = 'bar-block';
  const barTitle = t('Cómo se reparten los 32 bits: la máscara /{prefix} reserva {net} para la red y deja {hosts} para los equipos', {
    prefix: data.prefix, net: data.prefix, hosts: 32 - data.prefix,
  });
  bar.innerHTML = `<div class="bar-title">${barTitle}</div>${bitBarHtml([
    { label: 'Red', bits: data.prefix, color: BIT_COLORS.network },
    { label: 'Equipos', bits: 32 - data.prefix, color: BIT_COLORS.hosts },
  ])}`;
  results.appendChild(bar);
}

function renderSavedList() {
  savedListEl.innerHTML = '';
  savedEmpty.hidden = savedSubnets.length > 0;

  savedSubnets.forEach((entry) => {
    const data = calculateSubnet(entry.ip, entry.prefix);
    const gw = gatewayAndDhcp(data, entry.gw);

    const metaHtml = gw
      ? `
        <div class="saved-meta"><span class="saved-meta-label">GW</span><span class="mono">${gw.gateway}</span><span class="saved-meta-note">(${entry.gw === 'last' ? 'última' : 'primera'} IP)</span></div>
        <div class="saved-meta"><span class="saved-meta-label">DHCP</span><span class="mono">${gw.dhcpStart} – ${gw.dhcpEnd}</span></div>
      `
      : '<div class="saved-meta saved-meta-note">Bloque muy pequeño para GW + DHCP</div>';

    const li = document.createElement('li');
    li.className = 'saved-item';
    li.tabIndex = 0;
    li.setAttribute('role', 'button');
    li.title = t('Clic para volver a cargar esta subred');
    li.innerHTML = `
      <div class="saved-item-top">
        ${entry.vlan ? `<span class="saved-vlan">${escapeHtml(entry.vlan)}</span>` : '<span></span>'}
        <span class="saved-actions">
          <button type="button" class="saved-split" title="Abrir en el divisor visual">Dividir</button>
          <button type="button" class="saved-delete" aria-label="Eliminar" title="Eliminar">×</button>
        </span>
      </div>
      <div class="saved-cidr mono">${data.network}/${data.prefix}</div>
      ${metaHtml}
    `;

    const load = () => {
      ipInput.value = `${entry.ip}/${entry.prefix}`;
      maskInput.value = '';
      vlanInput.value = entry.vlan || '';
      gwSelect.value = entry.gw || 'first';
      form.dispatchEvent(new Event('submit'));
    };
    li.addEventListener('click', load);
    li.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); load(); }
    });

    li.querySelector('.saved-split').addEventListener('click', (e) => {
      e.stopPropagation();
      window.dispatchEvent(new CustomEvent('ipcalc:show-tab', { detail: 'splitter' }));
      window.dispatchEvent(new CustomEvent('ipcalc:open-splitter', { detail: { ip: data.network, prefix: data.prefix } }));
    });

    li.querySelector('.saved-delete').addEventListener('click', (e) => {
      e.stopPropagation();
      savedSubnets = savedSubnets.filter((s) => s.id !== entry.id);
      persistSaved(savedSubnets);
      renderSavedList();
    });

    savedListEl.appendChild(li);
  });
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  errorBox.hidden = true;
  results.hidden = true;
  toolbar.hidden = true;
  lastResult = null;
  try {
    const { ip, prefix } = parseIpAndPrefix(ipInput.value, maskInput.value);
    const data = calculateSubnet(ip, prefix);
    lastResult = { ip, prefix };
    render(data);
    toolbar.hidden = false;
    pushRecent(`${ip}/${prefix}`);
  } catch (err) {
    errorBox.textContent = err.message;
    errorBox.hidden = false;
  }
});

saveBtn.addEventListener('click', () => {
  if (!lastResult) return;
  savedSubnets.unshift({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    vlan: vlanInput.value.trim(),
    ip: lastResult.ip,
    prefix: lastResult.prefix,
    gw: gwSelect.value,
  });
  persistSaved(savedSubnets);
  renderSavedList();

  const original = saveBtn.textContent;
  saveBtn.textContent = t('Guardada');
  setTimeout(() => { saveBtn.textContent = original; }, 1200);
});

document.querySelectorAll('.v4-example').forEach((btn) => {
  btn.addEventListener('click', () => {
    ipInput.value = btn.dataset.value;
    maskInput.value = '';
    form.dispatchEvent(new Event('submit', { cancelable: true }));
  });
});

shareBtn.addEventListener('click', async () => {
  if (!lastResult) return;
  const params = new URLSearchParams({
    c: `${lastResult.ip}/${lastResult.prefix}`,
    v: vlanInput.value.trim(),
    g: gwSelect.value,
  });
  const url = `${location.origin}${location.pathname}#${params.toString()}`;
  try {
    await navigator.clipboard.writeText(url);
    const original = shareBtn.textContent;
    shareBtn.textContent = t('Enlace copiado');
    setTimeout(() => { shareBtn.textContent = original; }, 1200);
  } catch {
    window.prompt(t('Copia este enlace:'), url);
  }
});

// Another module (the splitter) added subnets to the saved list.
window.addEventListener('ipcalc:saved-changed', () => {
  savedSubnets = loadSaved();
  renderSavedList();
});

// Re-paint the currently shown result (built with t() at render time, so it
// stays baked in the old language otherwise) and the saved list.
window.addEventListener('ipcalc:lang', () => {
  renderSavedList();
  if (lastResult) render(calculateSubnet(lastResult.ip, lastResult.prefix));
});

renderSavedList();
renderRecent();

// Restore a calculation from a shared link (#c=ip/prefix&v=vlan&g=first|last).
const sharedParams = new URLSearchParams(location.hash.slice(1));
if (sharedParams.has('c')) {
  ipInput.value = sharedParams.get('c');
  maskInput.value = '';
  vlanInput.value = sharedParams.get('v') || '';
  gwSelect.value = sharedParams.get('g') === 'last' ? 'last' : 'first';
  form.dispatchEvent(new Event('submit', { cancelable: true }));
}
