// Shared "how the bits are split" bar: a colors-only bar plus a two-line legend
// (color + name, then the bit count), the same look as the planner's usage bar.
export function bitBarHtml(parts) {
  const visible = parts.filter((p) => p.bits > 0);
  const total = visible.reduce((sum, p) => sum + p.bits, 0);

  const bar = visible
    .map((p) => `<div class="use-seg" style="flex:${p.bits};background:${p.color}" title="${p.label}: ${p.bits} bits"></div>`)
    .join('');

  const legend = visible
    .map((p) => `<span class="legend-item"><span class="swatch" style="background:${p.color}"></span><span class="legend-body"><span class="legend-name">${p.label}</span><span class="legend-sub"><span class="legend-pct">${p.bits} bits</span></span></span></span>`)
    .join('');

  return `<div class="usebar" role="img" aria-label="Reparto de ${total} bits">${bar}</div><div class="use-legend">${legend}</div>`;
}

export const BIT_COLORS = {
  network: 'var(--accent)',
  subnets: 'var(--c1)',
  hosts: 'var(--border-strong)',
};
