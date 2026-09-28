import { t } from './i18n.js';

// IPv6 helpers built on BigInt (128-bit values).

const ALL_ONES = (1n << 128n) - 1n;

export function parseIPv6(input) {
  let str = input.trim().split('%')[0];
  if (!str) throw new Error(t('Escribe una dirección IPv6'));

  if (str.includes('.')) {
    const lastColon = str.lastIndexOf(':');
    const v4 = str.slice(lastColon + 1).split('.');
    if (v4.length !== 4 || v4.some((p) => !/^\d{1,3}$/.test(p) || Number(p) > 255)) {
      throw new Error(t('IPv4 incrustada inválida'));
    }
    const hi = ((Number(v4[0]) << 8) | Number(v4[1])).toString(16);
    const lo = ((Number(v4[2]) << 8) | Number(v4[3])).toString(16);
    str = `${str.slice(0, lastColon + 1)}${hi}:${lo}`;
  }

  const halves = str.split('::');
  if (halves.length > 2) throw new Error(t('Una dirección IPv6 solo puede tener un "::"'));

  const toGroups = (part) => (part === '' ? [] : part.split(':'));
  const head = toGroups(halves[0]);
  const tail = halves.length === 2 ? toGroups(halves[1]) : [];

  let groups;
  if (halves.length === 2) {
    const missing = 8 - head.length - tail.length;
    if (missing < 1) throw new Error(t('Demasiados grupos para usar "::"'));
    groups = [...head, ...Array(missing).fill('0'), ...tail];
  } else {
    groups = head;
  }
  if (groups.length !== 8) throw new Error(t('Una dirección IPv6 necesita 8 grupos'));

  let value = 0n;
  groups.forEach((g) => {
    if (!/^[0-9a-fA-F]{1,4}$/.test(g)) throw new Error(t('Grupo inválido: "{g}"', { g }));
    value = (value << 16n) | BigInt(parseInt(g, 16));
  });
  return value;
}

function groupsOf(value) {
  const out = [];
  for (let i = 7; i >= 0; i -= 1) out.push(Number((value >> BigInt(i * 16)) & 0xffffn));
  return out;
}

export function expandIPv6(value) {
  return groupsOf(value).map((g) => g.toString(16).padStart(4, '0')).join(':');
}

// RFC 5952: lowercase, no leading zeros, longest run of 2+ zero groups becomes "::".
export function compressIPv6(value) {
  const groups = groupsOf(value);
  let bestStart = -1;
  let bestLen = 0;
  for (let i = 0; i < 8;) {
    if (groups[i] !== 0) { i += 1; continue; }
    let j = i;
    while (j < 8 && groups[j] === 0) j += 1;
    if (j - i > bestLen) { bestStart = i; bestLen = j - i; }
    i = j;
  }
  const hex = groups.map((g) => g.toString(16));
  if (bestLen < 2) return hex.join(':');
  const left = hex.slice(0, bestStart).join(':');
  const right = hex.slice(bestStart + bestLen).join(':');
  return `${left}::${right}`;
}

export function prefixMask(prefix) {
  if (prefix <= 0) return 0n;
  if (prefix >= 128) return ALL_ONES;
  return ALL_ONES ^ ((1n << BigInt(128 - prefix)) - 1n);
}

export function parseIPv6Cidr(input) {
  const [addr, pfx] = input.trim().split('/');
  if (pfx === undefined || !/^\d{1,3}$/.test(pfx.trim())) throw new Error(t('Indica el prefijo, por ejemplo 2001:db8::/32'));
  const prefix = Number(pfx);
  if (prefix < 0 || prefix > 128) throw new Error(t('El prefijo debe estar entre 0 y 128'));
  return { value: parseIPv6(addr), prefix };
}

export function networkOf(value, prefix) {
  return value & prefixMask(prefix);
}

export function lastOf(value, prefix) {
  return networkOf(value, prefix) | (ALL_ONES ^ prefixMask(prefix));
}

export function addressCount(prefix) {
  return 1n << BigInt(128 - prefix);
}

// 1234567 -> "1,234,567" (BigInt-safe).
export function groupDigits(big) {
  return big.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

const TYPES = [
  [0n, 128, 'No especificada (::/128)'],
  [1n, 128, 'Loopback (::1/128)'],
  [0xffffn << 32n, 96, 'IPv4 mapeada (::ffff:0:0/96)'],
  [0xfe80n << 112n, 10, 'Unicast link-local (fe80::/10)'],
  [0xfc00n << 112n, 7, 'Unicast local única - ULA (fc00::/7)'],
  [0xff00n << 112n, 8, 'Multicast (ff00::/8)'],
  [0x20010db8n << 96n, 32, 'Documentación (2001:db8::/32)'],
  [0x2000n << 112n, 3, 'Unicast global (2000::/3)'],
];

export function describeType(value) {
  const match = TYPES.find(([base, len]) => (value & prefixMask(len)) === base);
  return match ? match[2] : 'Reservada / sin asignar';
}
