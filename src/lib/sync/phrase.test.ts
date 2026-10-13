import { describe, expect, it } from 'vitest';
import { BIP39_ENGLISH } from './bip39English';
import { newSecret, phraseToSecret, resolveWord, secretToPhrase, splitWords } from './phrase';

const hex = (text: string) => Uint8Array.from(text.match(/../g) ?? [], (b) => parseInt(b, 16));

/** BIP-39's own test vectors for 128-bit entropy (Trezor's reference set), English list. */
const VECTORS: [string, string][] = [
  [
    '00000000000000000000000000000000',
    'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
  ],
  [
    '7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f',
    'legal winner thank year wave sausage worth useful legal winner thank yellow',
  ],
  [
    '80808080808080808080808080808080',
    'letter advice cage absurd amount doctor acoustic avoid letter advice cage above',
  ],
  ['ffffffffffffffffffffffffffffffff', 'zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo wrong'],
  [
    '9e885d952ad362caeb4efe34a8e91bd2',
    'ozone drill grab fiber curtain grace pudding thank cruise elder eight picnic',
  ],
  [
    'c0ba5a8e914111210f2bd131f3d5e08d',
    'scheme spot photo card baby mountain device kick cradle pact join borrow',
  ],
  [
    'f30f8c1da665478f49b001d94c5fc452',
    'vessel ladder alter error federal sibling chat ability sun glass valve picture',
  ],
  [
    '77c2b00716cec7213839159e404db50d',
    'jelly better achieve collect unaware mountain thought cargo oxygen act hood bridge',
  ],
  [
    '0460ef47585604c5660618db2e6a7e7f',
    'afford alter spike radar gate glance object seek swamp infant panel yellow',
  ],
  [
    'eaebabb2383351fd31d703840b32e9e2',
    'turtle front uncle idea crush write shrug there lottery flower risk shell',
  ],
];

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

describe('the word list', () => {
  it('is BIP-39 English, word for word', async () => {
    expect(BIP39_ENGLISH).toHaveLength(2048);
    // The SHA-256 of english.txt in the bitcoin/bips repository.
    expect(await sha256Hex(`${BIP39_ENGLISH.join('\n')}\n`)).toBe(
      '2f5eed53a4727b4bf8880d8f3f199efc90e58503646d9ff8eff3a2ed3b24dbda',
    );
  });

  it('knows every word by its first four letters', () => {
    expect(new Set(BIP39_ENGLISH.map((w) => w.slice(0, 4))).size).toBe(2048);
  });
});

describe('secretToPhrase and phraseToSecret', () => {
  it.each(VECTORS)(
    'writes %s as the reference words, and reads them back',
    async (entropy, words) => {
      const secret = hex(entropy);
      expect((await secretToPhrase(secret)).join(' ')).toBe(words);
      const read = await phraseToSecret(words);
      expect(read.ok).toBe(true);
      if (read.ok) {
        expect([...read.secret]).toEqual([...secret]);
        expect(read.words.join(' ')).toBe(words);
      }
    },
  );

  it('round-trips random secrets', async () => {
    for (let i = 0; i < 40; i++) {
      const secret = newSecret();
      const words = await secretToPhrase(secret);
      expect(words).toHaveLength(12);
      const read = await phraseToSecret(words.join(' '));
      expect(read.ok && [...read.secret]).toEqual([...secret]);
    }
  });

  it('only takes 16-byte secrets', async () => {
    await expect(secretToPhrase(new Uint8Array(15))).rejects.toThrow(/16 bytes/);
  });

  it('reads a phrase however it was copied', async () => {
    const reference = 'legal winner thank year wave sausage worth useful legal winner thank yellow';
    const variants = [
      'LEGAL Winner thank year wave sausage worth useful legal winner thank yellow',
      'legal-winner-thank-year-wave-sausage-worth-useful-legal-winner-thank-yellow',
      '1. legal 2. winner 3. thank 4. year\n5) wave 6) sausage 7) worth 8) useful\n9 legal 10 winner, 11 thank, 12 yellow',
      // Four letters are enough.
      'lega winn than year wave saus wort usef lega winn than yell',
      '  legal\twinner thank year wave sausage worth useful legal winner thank yellow  ',
    ];
    for (const text of variants) {
      const read = await phraseToSecret(text);
      expect(read.ok && read.words.join(' ')).toBe(reference);
    }
  });

  it('names the words that are not in the list', async () => {
    const read = await phraseToSecret(
      'legal winner thank year wave sausagx worth useful legal qqqq thank yellow',
    );
    expect(read).toMatchObject({ ok: false, unknown: [5, 9] });
    expect(!read.ok && read.reason).toMatch(/These words are not in the list: “sausagx”, “qqqq”/);
  });

  it('counts the words', async () => {
    const read = await phraseToSecret('legal winner thank year wave sausage worth useful');
    expect(!read.ok && read.reason).toBe('A recovery phrase has 12 words; this has 8.');
  });

  it('catches a wrong word by the checksum', async () => {
    const read = await phraseToSecret('zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo');
    expect(!read.ok && read.reason).toMatch(/not a recovery phrase/);
    // Two words swapped.
    const swapped = await phraseToSecret(
      'winner legal thank year wave sausage worth useful legal winner thank yellow',
    );
    expect(swapped.ok).toBe(false);
  });
});

describe('splitWords and resolveWord', () => {
  it('splits on anything that is not a letter, and drops numbering', () => {
    expect(splitWords('1. Legal 2) winner\nthank, year—wave')).toEqual([
      'legal',
      'winner',
      'thank',
      'year',
      'wave',
    ]);
  });

  it('resolves whole words and four-letter starts', () => {
    expect(resolveWord('act')).toBe('act');
    expect(resolveWord('aban')).toBe('abandon');
    expect(resolveWord('abando')).toBe('abandon');
    expect(resolveWord('abandonx')).toBeNull();
    expect(resolveWord('aba')).toBeNull();
    expect(resolveWord('zzzz')).toBeNull();
  });
});
