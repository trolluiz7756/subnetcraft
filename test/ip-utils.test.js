import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidIPv4,
  ipToInt,
  intToIp,
  prefixToMaskInt,
  maskIntToPrefix,
  isValidMask,
  getIpClass,
  isPrivate,
  calculateSubnet,
  parseIpAndPrefix,
} from '../js/ip-utils.js';

test('isValidIPv4 accepts valid dotted addresses and rejects invalid ones', () => {
  assert.equal(isValidIPv4('192.168.1.1'), true);
  assert.equal(isValidIPv4('0.0.0.0'), true);
  assert.equal(isValidIPv4('255.255.255.255'), true);
  assert.equal(isValidIPv4('256.1.1.1'), false);
  assert.equal(isValidIPv4('1.2.3'), false);
  assert.equal(isValidIPv4('1.2.3.4.5'), false);
  assert.equal(isValidIPv4('abc.1.1.1'), false);
});

test('ipToInt / intToIp round-trip', () => {
  assert.equal(intToIp(ipToInt('10.20.30.40')), '10.20.30.40');
  assert.equal(ipToInt('255.255.255.255') >>> 0, 0xffffffff);
  assert.equal(intToIp(0), '0.0.0.0');
});

test('prefixToMaskInt / maskIntToPrefix round-trip', () => {
  assert.equal(prefixToMaskInt(24) >>> 0, 0xffffff00);
  assert.equal(prefixToMaskInt(0), 0);
  assert.equal(prefixToMaskInt(32) >>> 0, 0xffffffff);
  assert.equal(maskIntToPrefix(0xffffff00), 24);
  assert.equal(maskIntToPrefix(0), 0);
  assert.equal(maskIntToPrefix(0xffffffff), 32);
  assert.equal(maskIntToPrefix(0xff00ff00), null); // non-contiguous (255.0.255.0)
});

test('isValidMask only accepts contiguous dotted masks', () => {
  assert.equal(isValidMask('255.255.255.0'), true);
  assert.equal(isValidMask('255.255.255.1'), false);
  assert.equal(isValidMask('not.an.ip.mask'), false);
});

test('calculateSubnet computes the standard breakdown for a /24', () => {
  const r = calculateSubnet('192.168.1.10', 24);
  assert.equal(r.network, '192.168.1.0');
  assert.equal(r.broadcast, '192.168.1.255');
  assert.equal(r.firstHost, '192.168.1.1');
  assert.equal(r.lastHost, '192.168.1.254');
  assert.equal(r.usableHosts, 254);
  assert.equal(r.totalHosts, 256);
  assert.equal(r.mask, '255.255.255.0');
});

test('calculateSubnet handles the /31 point-to-point (RFC 3021) and /32 host-route edge cases', () => {
  const p2p = calculateSubnet('10.0.0.0', 31);
  assert.equal(p2p.usableHosts, 2);
  assert.equal(p2p.firstHost, '10.0.0.0');
  assert.equal(p2p.lastHost, '10.0.0.1');

  const host = calculateSubnet('10.0.0.5', 32);
  assert.equal(host.usableHosts, 1);
  assert.equal(host.firstHost, '10.0.0.5');
  assert.equal(host.lastHost, '10.0.0.5');
});

test('getIpClass classifies the legacy address classes', () => {
  assert.equal(getIpClass(ipToInt('10.0.0.1')), 'A');
  assert.equal(getIpClass(ipToInt('172.16.0.1')), 'B');
  assert.equal(getIpClass(ipToInt('192.168.1.1')), 'C');
  assert.equal(getIpClass(ipToInt('224.0.0.1')), 'D (Multicast)');
  assert.equal(getIpClass(ipToInt('240.0.0.1')), 'E (Experimental)');
});

test('isPrivate flags RFC1918 and related reserved ranges', () => {
  assert.equal(isPrivate(ipToInt('10.1.2.3')), true);
  assert.equal(isPrivate(ipToInt('172.20.0.1')), true);
  assert.equal(isPrivate(ipToInt('192.168.5.5')), true);
  assert.equal(isPrivate(ipToInt('8.8.8.8')), false);
});

test('parseIpAndPrefix accepts every documented input format', () => {
  assert.deepEqual(parseIpAndPrefix('192.168.1.10/24'), { ip: '192.168.1.10', prefix: 24 });
  assert.deepEqual(parseIpAndPrefix('192.168.1.10', '255.255.255.0'), { ip: '192.168.1.10', prefix: 24 });
  assert.deepEqual(parseIpAndPrefix('192.168.1.10 255.255.255.0'), { ip: '192.168.1.10', prefix: 24 });
  assert.deepEqual(parseIpAndPrefix('192.168.1.10', '0.0.0.255'), { ip: '192.168.1.10', prefix: 24 }); // wildcard mask
});

test('parseIpAndPrefix rejects IPv6 input and invalid masks', () => {
  assert.throws(() => parseIpAndPrefix('2001:db8::1', '64'));
  assert.throws(() => parseIpAndPrefix('10.0.0.1', '255.255.255.5'));
  assert.throws(() => parseIpAndPrefix('10.0.0.1', ''));
});
