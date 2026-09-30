import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseIPv6,
  expandIPv6,
  compressIPv6,
  parseIPv6Cidr,
  networkOf,
  lastOf,
  addressCount,
  groupDigits,
  describeType,
} from '../js/ipv6-utils.js';

test('parseIPv6 / expandIPv6 round-trip for a compressed address', () => {
  const v = parseIPv6('2001:db8::1');
  assert.equal(expandIPv6(v), '2001:0db8:0000:0000:0000:0000:0000:0001');
});

test('parseIPv6 handles the all-zeros and loopback shorthands', () => {
  assert.equal(parseIPv6('::'), 0n);
  assert.equal(parseIPv6('::1'), 1n);
});

test('parseIPv6 parses an embedded IPv4 tail', () => {
  const v = parseIPv6('::ffff:192.168.1.1');
  assert.equal(expandIPv6(v).endsWith('ffff:c0a8:0101'), true);
});

test('parseIPv6 rejects malformed input', () => {
  assert.throws(() => parseIPv6(''));
  assert.throws(() => parseIPv6('2001::db8::1')); // two "::"
  assert.throws(() => parseIPv6('2001:db8:1')); // too few groups
  assert.throws(() => parseIPv6('2001:zzzz::1')); // invalid hex group
});

test('compressIPv6 picks the first longest run of zero groups (RFC 5952)', () => {
  const v = parseIPv6('2001:0db8:0000:0000:0001:0000:0000:0001');
  assert.equal(compressIPv6(v), '2001:db8::1:0:0:1');
});

test('compressIPv6 does not collapse a single zero group', () => {
  const v = parseIPv6('2001:db8:0:1:2:3:4:5');
  assert.equal(compressIPv6(v), '2001:db8:0:1:2:3:4:5');
});

test('prefixMask / networkOf / lastOf for a /64', () => {
  const { value, prefix } = parseIPv6Cidr('2001:db8:abcd:1234::/64');
  assert.equal(prefix, 64);
  assert.equal(compressIPv6(networkOf(value, prefix)), '2001:db8:abcd:1234::');
  assert.equal(compressIPv6(lastOf(value, prefix)), '2001:db8:abcd:1234:ffff:ffff:ffff:ffff');
});

test('addressCount is 2^(128-prefix)', () => {
  assert.equal(addressCount(128), 1n);
  assert.equal(addressCount(64), 1n << 64n);
  assert.equal(addressCount(0), 1n << 128n);
});

test('groupDigits adds thousands separators to a BigInt', () => {
  assert.equal(groupDigits(1234567890n), '1,234,567,890');
  assert.equal(groupDigits(999n), '999');
});

test('describeType recognizes ULA, link-local and loopback', () => {
  assert.equal(describeType(parseIPv6('fd12:3456:789a::1')), 'Unicast local única - ULA (fc00::/7)');
  assert.equal(describeType(parseIPv6('fe80::1')), 'Unicast link-local (fe80::/10)');
  assert.equal(describeType(parseIPv6('::1')), 'Loopback (::1/128)');
});

test('parseIPv6Cidr rejects a missing or out-of-range prefix', () => {
  assert.throws(() => parseIPv6Cidr('2001:db8::'));
  assert.throws(() => parseIPv6Cidr('2001:db8::/200'));
});
