// Core IPv4 math utilities shared by the calculator and the subnet splitter.

export function isValidIPv4(str) {
  if (typeof str !== 'string') return false;
  const parts = str.trim().split('.');
  if (parts.length !== 4) return false;
  return parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) >= 0 && Number(p) <= 255);
}

export function ipToInt(ip) {
  const parts = ip.trim().split('.').map(Number);
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

export function intToIp(int) {
  return [(int >>> 24) & 255, (int >>> 16) & 255, (int >>> 8) & 255, int & 255].join('.');
}

export function prefixToMaskInt(prefix) {
  if (prefix <= 0) return 0;
  if (prefix >= 32) return 0xffffffff >>> 0;
  return (0xffffffff << (32 - prefix)) >>> 0;
}

export function maskIntToPrefix(maskInt) {
  let bits = 0;
  let seenZero = false;
  for (let i = 31; i >= 0; i--) {
    const bit = (maskInt >>> i) & 1;
    if (bit === 1) {
      if (seenZero) return null; // non-contiguous mask, invalid
      bits++;
    } else {
      seenZero = true;
    }
  }
  return bits;
}

export function isValidMask(str) {
  if (!isValidIPv4(str)) return false;
  return maskIntToPrefix(ipToInt(str)) !== null;
}

export function toBinaryOctets(int) {
  const octets = [(int >>> 24) & 255, (int >>> 16) & 255, (int >>> 8) & 255, int & 255];
  return octets.map((o) => o.toString(2).padStart(8, '0')).join('.');
}

export function getIpClass(int) {
  const firstOctet = (int >>> 24) & 255;
  if (firstOctet < 128) return 'A';
  if (firstOctet < 192) return 'B';
  if (firstOctet < 224) return 'C';
  if (firstOctet < 240) return 'D (Multicast)';
  return 'E (Experimental)';
}

export function isPrivate(int) {
  const a = intToIp(int);
  const ranges = [
    ['10.0.0.0', 8],
    ['172.16.0.0', 12],
    ['192.168.0.0', 16],
    ['127.0.0.0', 8],
    ['169.254.0.0', 16],
  ];
  return ranges.some(([net, prefix]) => {
    const mask = prefixToMaskInt(prefix);
    return (ipToInt(a) & mask) >>> 0 === (ipToInt(net) & mask) >>> 0;
  });
}

// Full breakdown of a network given an IP and prefix length (0-32).
export function calculateSubnet(ipStr, prefix) {
  const ipInt = ipToInt(ipStr);
  const maskInt = prefixToMaskInt(prefix);
  const wildcardInt = ~maskInt >>> 0;
  const networkInt = (ipInt & maskInt) >>> 0;
  const broadcastInt = (networkInt | wildcardInt) >>> 0;
  const totalHosts = Math.pow(2, 32 - prefix);

  let firstHost, lastHost, usableHosts;
  if (prefix === 32) {
    firstHost = networkInt;
    lastHost = networkInt;
    usableHosts = 1;
  } else if (prefix === 31) {
    firstHost = networkInt;
    lastHost = broadcastInt;
    usableHosts = 2; // RFC 3021 point-to-point link
  } else {
    firstHost = networkInt + 1;
    lastHost = broadcastInt - 1;
    usableHosts = totalHosts - 2;
  }

  return {
    ip: ipStr,
    prefix,
    mask: intToIp(maskInt),
    wildcard: intToIp(wildcardInt),
    network: intToIp(networkInt),
    broadcast: intToIp(broadcastInt),
    firstHost: intToIp(firstHost),
    lastHost: intToIp(lastHost),
    totalHosts,
    usableHosts,
    ipClass: getIpClass(ipInt),
    isPrivate: isPrivate(ipInt),
    binary: {
      ip: toBinaryOctets(ipInt),
      mask: toBinaryOctets(maskInt),
      network: toBinaryOctets(networkInt),
      broadcast: toBinaryOctets(broadcastInt),
    },
    networkInt,
    broadcastInt,
    maskInt,
  };
}

// Accepts "192.168.1.10/24", "192.168.1.10 255.255.255.0", "192.168.1.10/255.255.255.0",
// or the IP in one field and a /prefix, dotted mask or wildcard in the other.
import { t } from './i18n.js';

export function parseIpAndPrefix(ipInput, maskInput) {
  let ip = ipInput.trim();
  let maskText = (maskInput || '').trim();

  const slash = ip.indexOf('/');
  if (slash !== -1) {
    maskText = ip.slice(slash + 1).trim();
    ip = ip.slice(0, slash).trim();
  } else if (/\s/.test(ip)) {
    const [first, ...rest] = ip.split(/\s+/);
    ip = first;
    if (rest.length) maskText = rest.join(' ');
  }
  maskText = maskText.replace(/^\//, '');

  if (ip.includes(':')) throw new Error(t('Eso parece una dirección IPv6. Usa la pestaña "Calculadora IPv6".'));
  if (!isValidIPv4(ip)) throw new Error(t('Dirección IP inválida'));
  if (!maskText) throw new Error(t('Debes indicar un prefijo CIDR o máscara'));

  let prefix;
  if (/^\d{1,3}$/.test(maskText)) {
    prefix = Number(maskText);
  } else if (isValidMask(maskText)) {
    prefix = maskIntToPrefix(ipToInt(maskText));
  } else if (isValidIPv4(maskText) && maskIntToPrefix((~ipToInt(maskText)) >>> 0) !== null) {
    prefix = maskIntToPrefix((~ipToInt(maskText)) >>> 0);
  } else {
    throw new Error(t('Máscara de subred inválida'));
  }
  if (prefix < 0 || prefix > 32) throw new Error(t('El prefijo CIDR debe estar entre 0 y 32'));

  return { ip, prefix };
}
