// Lays the splitter table out as a list of drawing primitives, so the exact same
// layout can be rasterised to a very high resolution PNG or written as vector SVG.

import { t } from './i18n.js';

const SANS = '"Space Grotesk", -apple-system, "Segoe UI", sans-serif';
const MONO = '"JetBrains Mono", "SF Mono", Consolas, monospace';

const PAD = 28;
const TITLE_H = 66;
const HEADER_H = 36;
const ROW_H = 42;
const CELL_PAD = 14;
const TREE_COL_W = 46;
const FOOTER_H = 30;

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function parseColor(str) {
  const s = str.trim();
  if (s.startsWith('#')) {
    const hex = s.length === 4 ? s.slice(1).split('').map((c) => c + c).join('') : s.slice(1);
    return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
  }
  const m = s.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const [r, g, b] = m[1].split(',').map((v) => parseFloat(v));
    return [r, g, b];
  }
  return [128, 128, 128];
}

function mix(fg, bg, t) {
  const a = parseColor(fg);
  const b = parseColor(bg);
  const c = a.map((v, i) => Math.round(v * t + b[i] * (1 - t)));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

function readTheme() {
  return {
    bg: cssVar('--bg') || '#0a0e16',
    text: cssVar('--text') || '#e9edf5',
    muted: cssVar('--muted') || '#8993a8',
    accent: cssVar('--accent') || '#ff5252',
    palette: Array.from({ length: 8 }, (_, i) => cssVar(`--c${i}`) || '#888888'),
  };
}

let measureCtx = null;
function measure(text, weight, size, family, letterSpacing = 0) {
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
  measureCtx.font = `${weight} ${size}px ${family}`;
  return measureCtx.measureText(text).width + letterSpacing * text.length;
}

// model: { title, subtitle, headers[], mono[], rows[][], tones[], tree: { cols, header, cells[] } }
function buildLayout(model) {
  const theme = readTheme();
  const { headers, mono, rows, tones, tree } = model;

  const colW = headers.map((h, i) => {
    let w = measure(h.toUpperCase(), 600, 10, SANS, 1);
    rows.forEach((row) => {
      w = Math.max(w, measure(row[i], 500, 12, mono[i] ? MONO : SANS));
    });
    return Math.ceil(w) + CELL_PAD * 2;
  });
  const infoW = colW.reduce((a, b) => a + b, 0);
  const treeW = tree.cols * TREE_COL_W;
  const tableW = infoW + treeW;

  const width = Math.ceil(Math.max(tableW, 520) + PAD * 2);
  const tableTop = PAD + TITLE_H;
  const height = tableTop + HEADER_H + rows.length * ROW_H + PAD + FOOTER_H;

  const gridColor = mix(theme.text, theme.bg, 0.14);
  const ops = [];

  ops.push({ t: 'rect', x: 0, y: 0, w: width, h: height, fill: theme.bg });
  ops.push({ t: 'text', x: PAD, y: PAD + 14, s: model.title, weight: 700, size: 20, family: SANS, color: theme.text });
  ops.push({ t: 'text', x: PAD, y: PAD + 42, s: model.subtitle, weight: 500, size: 12, family: SANS, color: theme.muted });

  ops.push({ t: 'rect', x: PAD, y: tableTop, w: tableW, h: HEADER_H, fill: mix(theme.text, theme.bg, 0.07) });
  let x = PAD;
  headers.forEach((h, i) => {
    ops.push({
      t: 'text', x: x + CELL_PAD, y: tableTop + HEADER_H / 2, s: h.toUpperCase(),
      weight: 600, size: 10, family: SANS, color: theme.muted, ls: 1,
    });
    x += colW[i];
  });
  ops.push({
    t: 'text', x: PAD + infoW + treeW / 2, y: tableTop + HEADER_H / 2, s: tree.header,
    weight: 600, size: 10, family: SANS, color: theme.muted, align: 'center',
  });

  rows.forEach((row, r) => {
    const y = tableTop + HEADER_H + r * ROW_H;
    const tone = theme.palette[tones[r] % 8];
    ops.push({ t: 'rect', x: PAD, y, w: infoW, h: ROW_H, fill: mix(tone, theme.bg, 0.26) });
    let cx = PAD;
    row.forEach((cell, i) => {
      ops.push({
        t: 'text', x: cx + CELL_PAD, y: y + ROW_H / 2, s: cell, weight: 500, size: 12,
        family: mono[i] ? MONO : SANS, color: mono[i] ? theme.accent : theme.text,
      });
      cx += colW[i];
    });
  });

  tree.cells.forEach((cell) => {
    const cx = PAD + infoW + cell.col * TREE_COL_W;
    const cy = tableTop + HEADER_H + cell.row * ROW_H;
    const w = cell.colSpan * TREE_COL_W;
    const h = cell.rowSpan * ROW_H;
    ops.push({ t: 'rect', x: cx, y: cy, w, h, fill: theme.palette[cell.tone % 8], stroke: 'rgba(4, 18, 26, 0.45)', sw: 1 });
    ops.push({
      t: 'text', x: cx + w / 2, y: cy + h / 2, s: cell.text, weight: 700, size: 12,
      family: MONO, color: '#04121a', align: 'center', rot: 90,
    });
  });

  for (let r = 0; r <= rows.length; r += 1) {
    const y = tableTop + HEADER_H + r * ROW_H;
    ops.push({ t: 'line', x1: PAD, y1: y, x2: PAD + infoW, y2: y, color: gridColor, w: 1 });
  }
  let vx = PAD;
  for (let i = 0; i <= colW.length; i += 1) {
    ops.push({ t: 'line', x1: vx, y1: tableTop, x2: vx, y2: tableTop + HEADER_H + rows.length * ROW_H, color: gridColor, w: 1 });
    vx += colW[i] || 0;
  }
  ops.push({
    t: 'rect', x: PAD, y: tableTop, w: tableW, h: HEADER_H + rows.length * ROW_H, fill: 'none', stroke: gridColor, sw: 1,
  });

  ops.push({
    t: 'text', x: PAD, y: height - PAD / 2 - 4, s: t('Generado con SubnetCraft'), weight: 500, size: 10, family: SANS, color: theme.muted,
  });

  return { width, height, ops };
}

function drawCanvas(layout, scale) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(layout.width * scale);
  canvas.height = Math.round(layout.height * scale);
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);
  ctx.textBaseline = 'middle';

  layout.ops.forEach((op) => {
    if (op.t === 'rect') {
      if (op.fill && op.fill !== 'none') {
        ctx.fillStyle = op.fill;
        ctx.fillRect(op.x, op.y, op.w, op.h);
      }
      if (op.stroke) {
        ctx.strokeStyle = op.stroke;
        ctx.lineWidth = op.sw || 1;
        ctx.strokeRect(op.x + 0.5, op.y + 0.5, op.w - 1, op.h - 1);
      }
    } else if (op.t === 'line') {
      ctx.strokeStyle = op.color;
      ctx.lineWidth = op.w;
      ctx.beginPath();
      ctx.moveTo(op.x1 + 0.5, op.y1 + 0.5);
      ctx.lineTo(op.x2 + 0.5, op.y2 + 0.5);
      ctx.stroke();
    } else if (op.t === 'text') {
      ctx.save();
      ctx.font = `${op.weight} ${op.size}px ${op.family}`;
      ctx.fillStyle = op.color;
      ctx.textAlign = op.align || 'left';
      if ('letterSpacing' in ctx) ctx.letterSpacing = `${op.ls || 0}px`;
      ctx.translate(op.x, op.y);
      if (op.rot) ctx.rotate((op.rot * Math.PI) / 180);
      ctx.fillText(op.s, 0, 0);
      ctx.restore();
    }
  });
  return canvas;
}

function escapeXml(str) {
  return str.replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function drawSvg(layout) {
  const parts = layout.ops.map((op) => {
    if (op.t === 'rect') {
      const fill = op.fill || 'none';
      const stroke = op.stroke ? ` stroke="${op.stroke}" stroke-width="${op.sw || 1}"` : '';
      const inset = op.stroke ? 0.5 : 0;
      return `<rect x="${op.x + inset}" y="${op.y + inset}" width="${op.w - inset * 2}" height="${op.h - inset * 2}" fill="${fill}"${stroke}/>`;
    }
    if (op.t === 'line') {
      return `<line x1="${op.x1 + 0.5}" y1="${op.y1 + 0.5}" x2="${op.x2 + 0.5}" y2="${op.y2 + 0.5}" stroke="${op.color}" stroke-width="${op.w}"/>`;
    }
    const anchor = op.align === 'center' ? 'middle' : 'start';
    const rot = op.rot ? ` transform="rotate(${op.rot} ${op.x} ${op.y})"` : '';
    const ls = op.ls ? ` letter-spacing="${op.ls}"` : '';
    const family = op.family.replace(/"/g, "'");
    return `<text x="${op.x}" y="${op.y}" font-family="${family}" font-size="${op.size}" font-weight="${op.weight}" fill="${op.color}" text-anchor="${anchor}" dominant-baseline="central"${rot}${ls}>${escapeXml(op.s)}</text>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${layout.height}" viewBox="0 0 ${layout.width} ${layout.height}">\n${parts.join('\n')}\n</svg>\n`;
}

// Picks the largest scale (up to maxScale) that keeps the canvas within browser limits.
function safeScale(layout, maxScale) {
  const bySide = 16000 / Math.max(layout.width, layout.height);
  const byArea = Math.sqrt(150e6 / (layout.width * layout.height));
  return Math.max(1, Math.min(maxScale, bySide, byArea));
}

export async function renderPng(model, maxScale = 4) {
  if (document.fonts && document.fonts.ready) await document.fonts.ready;
  const layout = buildLayout(model);
  const scale = safeScale(layout, maxScale);
  const canvas = drawCanvas(layout, scale);
  const blob = await new Promise((resolve) => { canvas.toBlob(resolve, 'image/png'); });
  if (!blob) throw new Error(t('El navegador no pudo generar una imagen tan grande. Usa la opción SVG.'));
  return { blob, width: canvas.width, height: canvas.height };
}

export async function renderSvg(model) {
  if (document.fonts && document.fonts.ready) await document.fonts.ready;
  return new Blob([drawSvg(buildLayout(model))], { type: 'image/svg+xml;charset=utf-8' });
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
