// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { addressKey } from './src/address.mjs';

describe('addressKey', () => {
  it('keeps an IPv4 address as it is', () => {
    expect(addressKey('192.0.2.1')).toBe('192.0.2.1');
    expect(addressKey(' 203.0.113.250 ')).toBe('203.0.113.250');
  });

  it('reduces an IPv6 address to its /64', () => {
    expect(addressKey('2001:db8:1:2:3:4:5:6')).toBe('2001:db8:1:2::/64');
    expect(addressKey('2001:0DB8:0001:0002:ffff::1')).toBe('2001:db8:1:2::/64');
    expect(addressKey('2001:db8::1')).toBe('2001:db8:0:0::/64');
    expect(addressKey('fe80::1%eth0')).toBe('fe80:0:0:0::/64');
  });

  it('counts every address in one /64 together', () => {
    const one = addressKey('2001:db8:aa:bb:1111:2222:3333:4444');
    expect(addressKey('2001:db8:aa:bb::9')).toBe(one);
    expect(addressKey('2001:db8:aa:bc::9')).not.toBe(one);
  });

  it('reads an IPv4 address written as IPv6 as the IPv4 address', () => {
    expect(addressKey('::ffff:192.0.2.1')).toBe('192.0.2.1');
    expect(addressKey('::ffff:c000:201')).toBe('192.0.2.1');
  });

  it('calls anything else unknown', () => {
    for (const bad of [
      '',
      null,
      undefined,
      'localhost',
      '256.1.1.1',
      '1.2.3',
      '1::2::3',
      '12345::1',
      '1:2:3:4:5:6:7',
      '::ffff:300.1.1.1',
    ]) {
      expect(addressKey(bad)).toBe('unknown');
    }
  });
});
