// @vitest-environment node
import { createHash, createHmac } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeD1 } from './fakeD1';
import { d1Store } from './src/d1Store.mjs';
import {
  createRelay,
  DEFAULT_LIMITS,
  expireVaults,
  KEEP_ABANDONED_MS,
  type VaultLimits,
  type VaultStore,
} from './src/handler.mjs';
import { memoryPushStore } from './src/push/memoryPushStore.mjs';
import { createPushApi, NEW_REMINDERS_PER_ADDRESS } from './src/push/reminders.mjs';
import { memoryStore } from './src/memoryStore.mjs';
import {
  DAY_MS,
  EVERYONE,
  expireQuotas,
  keyedHash,
  type QuotaStore,
  saltName,
  secondsToMidnight,
  utcDay,
  wholeSetting,
  withSecret,
} from './src/quota.mjs';
import { nodeServer } from './src/server.mjs';
import { sqliteStore } from './src/sqliteStore.mjs';
import worker, { DAILY_CRON } from './src/worker.mjs';

const TOKEN = 'T'.repeat(43);
const OTHER_TOKEN = 'U'.repeat(43);
const URL_BASE = 'https://relay.test';
/** 12 October 2026, 21:00 UTC: three hours before midnight. */
const EVENING = Date.UTC(2026, 9, 12, 21);
const HOUR = 3_600_000;

/** A vault id (43 base64url characters), told apart by `n`. */
const vaultId = (n: number) => `${String(n).padStart(3, '0')}${'v'.repeat(40)}`;
const bytes = (...values: number[]) => new Uint8Array(values);

/** The SHA-256 of `text`, in hex. */
async function sha256(text: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function put(
  id: string,
  {
    from,
    version,
    body = bytes(1, 2, 3),
    token = TOKEN,
  }: { from?: string; version?: number; body?: Uint8Array<ArrayBuffer>; token?: string } = {},
) {
  return new Request(`${URL_BASE}/v1/vaults/${id}`, {
    method: 'PUT',
    body,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(version === undefined ? { 'If-None-Match': '*' } : { 'If-Match': `"${version}"` }),
      ...(from ? { 'CF-Connecting-IP': from } : {}),
    },
  });
}

const read = (id: string) =>
  new Request(`${URL_BASE}/v1/vaults/${id}`, { headers: { Authorization: `Bearer ${TOKEN}` } });

interface Stores {
  store: VaultStore;
  quotas: QuotaStore;
}

const stores: [string, () => Stores][] = [
  [
    'memory',
    () => {
      const store = memoryStore();
      return { store, quotas: store.quotas };
    },
  ],
  [
    'sqlite',
    () => {
      const store = sqliteStore(':memory:');
      return { store, quotas: store.quotas };
    },
  ],
  [
    'd1',
    () => {
      const store = d1Store(fakeD1());
      return { store, quotas: store.quotas };
    },
  ],
];

/** A relay over `made`, on a clock the test moves, with the limits given. */
function relayOver(made: Stores, limits: Partial<VaultLimits> = {}) {
  let clock = EVENING;
  const relay = createRelay({
    ...made,
    limits,
    minWriteIntervalMs: 1_000,
    now: () => clock,
  });
  return {
    relay,
    ...made,
    tick: (ms: number) => {
      clock += ms;
    },
    time: () => clock,
  };
}

describe('the day', () => {
  it('runs from midnight to midnight, UTC', () => {
    expect(utcDay(EVENING)).toBe('2026-10-12');
    expect(utcDay(Date.UTC(2026, 9, 12, 23, 59, 59, 999))).toBe('2026-10-12');
    expect(secondsToMidnight(EVENING)).toBe(3 * 3600);
    expect(secondsToMidnight(Date.UTC(2026, 9, 12, 23, 59, 59, 500))).toBe(1);
    expect(secondsToMidnight(Date.UTC(2026, 9, 13))).toBe(24 * 3600);
  });

  it('takes whole numbers for settings, and leaves the default for anything else', () => {
    expect(wholeSetting('7', 5)).toBe(7);
    expect(wholeSetting(undefined, 5)).toBe(5);
    expect(wholeSetting('', 5)).toBe(5);
    expect(wholeSetting('5O', 5)).toBe(5);
    expect(wholeSetting('-1', 5, 0)).toBe(5);
    expect(wholeSetting('0', 5)).toBe(5);
    expect(wholeSetting('0', 5, 0)).toBe(0);
    expect(wholeSetting('2.5', 5)).toBe(5);
  });
});

describe.each(stores)('the vault limits over the %s store', (_name, make) => {
  it('makes 5 new vaults a day from one address, then answers 429 until midnight', async () => {
    const { relay, tick } = relayOver(make());
    for (let n = 0; n < DEFAULT_LIMITS.newVaultsPerAddress; n++) {
      expect((await relay(put(vaultId(n), { from: '203.0.113.9' }))).status).toBe(201);
    }
    const refused = await relay(put(vaultId(10), { from: '203.0.113.9' }));
    expect(refused.status).toBe(429);
    expect(refused.headers.get('Retry-After')).toBe(String(3 * 3600));
    expect(await refused.json()).toEqual({
      error: 'Too many new vaults from here today: try again tomorrow.',
    });
    // Another address is not held back; the next day, this one is not either.
    expect((await relay(put(vaultId(11), { from: '198.51.100.4' }))).status).toBe(201);
    tick(3 * HOUR);
    expect((await relay(put(vaultId(12), { from: '203.0.113.9' }))).status).toBe(201);
  });

  it('counts the addresses of one IPv6 /64 together, and another /64 apart', async () => {
    const { relay } = relayOver(make(), { newVaultsPerAddress: 2 });
    expect((await relay(put(vaultId(0), { from: '2001:db8:aa:bb::1' }))).status).toBe(201);
    expect((await relay(put(vaultId(1), { from: '2001:db8:aa:bb:ffff::9' }))).status).toBe(201);
    expect((await relay(put(vaultId(2), { from: '2001:0db8:00aa:00bb:1:2:3:4' }))).status).toBe(
      429,
    );
    expect((await relay(put(vaultId(3), { from: '2001:db8:aa:bc::1' }))).status).toBe(201);
    // An IPv4 address written as IPv6 is that IPv4 address.
    expect((await relay(put(vaultId(4), { from: '192.0.2.1' }))).status).toBe(201);
    expect((await relay(put(vaultId(5), { from: '::ffff:192.0.2.1' }))).status).toBe(201);
    expect((await relay(put(vaultId(6), { from: '::ffff:c000:201' }))).status).toBe(429);
  });

  it('counts no address it does not know, rather than one allowance for everyone', async () => {
    const { relay } = relayOver(make(), { newVaultsPerAddress: 1 });
    // The Node server's own machine with no proxy header: no address reaches the handler.
    for (let n = 0; n < 3; n++) expect((await relay(put(vaultId(n)))).status).toBe(201);
    expect((await relay(put(vaultId(3), { from: 'not an address' }))).status).toBe(201);
    // Everyone's daily count still holds.
    expect((await relay(put(vaultId(4), { from: '192.0.2.7' }))).status).toBe(201);
    expect((await relay(put(vaultId(5), { from: '192.0.2.7' }))).status).toBe(429);
  });

  it('answers 507 for a full relay without spending anyone’s allowance', async () => {
    const { relay } = relayOver(make(), { maxDbBytes: 0, maxVaults: 0, newVaultsPerAddress: 1 });
    for (let n = 0; n < 3; n++) {
      expect((await relay(put(vaultId(n), { from: '192.0.2.8' }))).status).toBe(507);
    }
  });

  it('makes so many new vaults a day from everyone, then answers 503 until midnight', async () => {
    const { relay, tick } = relayOver(make(), { newVaultsPerDay: 3 });
    for (let n = 0; n < 3; n++) {
      expect((await relay(put(vaultId(n), { from: `192.0.2.${n}` }))).status).toBe(201);
    }
    const refused = await relay(put(vaultId(3), { from: '192.0.2.200' }));
    expect(refused.status).toBe(503);
    expect(refused.headers.get('Retry-After')).toBe(String(3 * 3600));
    tick(3 * HOUR);
    expect((await relay(put(vaultId(4), { from: '192.0.2.200' }))).status).toBe(201);
  });

  it('counts an address held back by its own limit nowhere else', async () => {
    const { relay } = relayOver(make(), { newVaultsPerAddress: 1, newVaultsPerDay: 2 });
    expect((await relay(put(vaultId(0), { from: '192.0.2.1' }))).status).toBe(201);
    for (let n = 1; n < 10; n++) {
      expect((await relay(put(vaultId(n), { from: '192.0.2.1' }))).status).toBe(429);
    }
    // Those refusals took nothing from the day's total.
    expect((await relay(put(vaultId(20), { from: '192.0.2.2' }))).status).toBe(201);
    expect((await relay(put(vaultId(21), { from: '192.0.2.3' }))).status).toBe(503);
  });

  it('asks the optional rate-limiting binding before counting anything', async () => {
    const made = make();
    const take = vi.spyOn(made.quotas, 'take');
    const relay = createRelay({ ...made, allowCreate: () => false, now: () => EVENING });
    const refused = await relay(put(vaultId(0), { from: '192.0.2.1' }));
    expect(refused.status).toBe(429);
    expect(refused.headers.get('Retry-After')).toBe('60');
    expect(take).not.toHaveBeenCalled();
  });

  it('takes at most so many writes a vault a day, and tells that from a version that moved on', async () => {
    const { relay, store, tick } = relayOver(make(), { vaultWritesPerDay: 3 });
    const id = vaultId(0);
    expect((await relay(put(id))).status).toBe(201);
    tick(1_000);
    expect((await relay(put(id, { version: 1 }))).status).toBe(200);
    // Still one a second at most.
    const tooSoon = await relay(put(id, { version: 2 }));
    expect(tooSoon.status).toBe(429);
    expect(tooSoon.headers.get('Retry-After')).toBe('1');
    tick(1_000);
    expect((await relay(put(id, { version: 2 }))).status).toBe(200);
    tick(1_000);
    // Made, and written twice: the day's three writes are spent.
    const spent = await relay(put(id, { version: 3 }));
    expect(spent.status).toBe(429);
    expect(spent.headers.get('Retry-After')).toBe(String(3 * 3600 - 3));
    expect(await spent.json()).toEqual({
      error: 'This vault has taken all the writes it takes today: try again tomorrow.',
    });
    // A device behind is told the version moved on, as ever.
    const stale = await relay(put(id, { version: 2 }));
    expect(stale.status).toBe(412);
    expect(stale.headers.get('ETag')).toBe('"3"');
    // The store refuses as the relay does, at once, whatever was read before.
    const at = EVENING + 10_000;
    expect(await store.update(id, 3, bytes(9), at, 3)).toEqual({
      ok: false,
      current: 3,
      capped: true,
    });
    expect(await store.update(id, 2, bytes(9), at, 3)).toEqual({ ok: false, current: 3 });
    expect(await store.update(vaultId(99), 1, bytes(9), at, 3)).toEqual({
      ok: false,
      current: null,
    });
    // Reading is not writing; the next day the count starts again.
    expect((await relay(read(id))).status).toBe(200);
    tick(3 * HOUR);
    expect((await relay(put(id, { version: 3 }))).status).toBe(200);
    expect(await store.get(id)).toMatchObject({ version: 4, writesDay: '2026-10-13', writes: 1 });
  });

  it('forgets a vault never written after it was made, once unused for 30 days', async () => {
    const { relay, store, tick, time } = relayOver(make());
    const [abandoned, written, read30] = [vaultId(0), vaultId(1), vaultId(2)];
    for (const id of [abandoned, written, read30]) {
      expect((await relay(put(id))).status).toBe(201);
    }
    tick(1_000);
    expect((await relay(put(written, { version: 1 }))).status).toBe(200);
    tick(10 * DAY_MS);
    expect((await relay(read(read30))).status).toBe(200);
    tick(KEEP_ABANDONED_MS - 10 * DAY_MS);
    expect(await expireVaults(store, time())).toBe(1);
    expect(await store.get(abandoned)).toBeNull();
    // Written after it was made, or read since: kept, as any vault used in the last year is.
    expect(await store.get(written)).not.toBeNull();
    expect(await store.get(read30)).not.toBeNull();
    tick(10 * DAY_MS + 1);
    expect(await expireVaults(store, time())).toBe(1);
    expect(await store.get(read30)).toBeNull();
    expect(await store.get(written)).not.toBeNull();
  });

  it('forgets counts and salts older than yesterday', async () => {
    const { relay, quotas, tick, time } = relayOver(make());
    expect((await relay(put(vaultId(0), { from: '192.0.2.1' }))).status).toBe(201);
    const salt = await quotas.salt(utcDay(time()), 'another');
    expect(salt).toMatch(/^[0-9a-f]{64}$/);
    // The next day: the day before is yesterday, and stays.
    tick(DAY_MS);
    expect(await expireQuotas(quotas, time())).toBe(0);
    expect(await quotas.salt('2026-10-12', 'another')).toBe(salt);
    // The day after: it goes, its salt with it (two counts: the address's and everyone's).
    tick(DAY_MS);
    expect(await expireQuotas(quotas, time())).toBe(3);
    expect(await quotas.salt('2026-10-12', 'another')).toBe('another');
  });
});

describe('the room a relay has for new vaults', () => {
  it('makes none once D1 says the database is at the budget, and lets the vaults kept grow', async () => {
    let size: unknown = DEFAULT_LIMITS.maxDbBytes - 1;
    const store = d1Store(fakeD1({ sizeAfter: () => size }));
    const { relay, tick } = relayOver({ store, quotas: store.quotas });
    expect((await relay(put(vaultId(0), { from: '192.0.2.1' }))).status).toBe(201);
    size = DEFAULT_LIMITS.maxDbBytes;
    const full = await relay(put(vaultId(1), { from: '192.0.2.2' }));
    expect(full.status).toBe(507);
    expect(await full.json()).toEqual({
      error: 'The relay is full: it makes no new vaults for now.',
    });
    tick(1_000);
    expect((await relay(put(vaultId(0), { version: 1, body: bytes(4, 5, 6, 7) }))).status).toBe(
      200,
    );
  });

  it('counts the vaults instead when D1 does not say how big the database is', async () => {
    const store = d1Store(fakeD1({ sizeAfter: () => undefined }));
    expect(await store.quotas.bytes()).toBeNull();
    const { relay } = relayOver({ store, quotas: store.quotas }, { maxVaults: 2 });
    expect((await relay(put(vaultId(0), { from: '192.0.2.1' }))).status).toBe(201);
    expect((await relay(put(vaultId(1), { from: '192.0.2.2' }))).status).toBe(201);
    expect((await relay(put(vaultId(2), { from: '192.0.2.3' }))).status).toBe(507);
    expect(await store.count()).toBe(2);
  });

  it('measures a SQLite file by its pages', async () => {
    const store = sqliteStore(':memory:');
    const before = await store.quotas.bytes();
    expect(before).toBeGreaterThan(0);
    const { relay } = relayOver({ store, quotas: store.quotas }, { maxDbBytes: before! + 50_000 });
    expect((await relay(put(vaultId(0), { body: new Uint8Array(60_000).fill(1) }))).status).toBe(
      201,
    );
    expect(await store.quotas.bytes()).toBeGreaterThanOrEqual(before! + 50_000);
    expect((await relay(put(vaultId(1)))).status).toBe(507);
  });

  it('measures memory by the bytes of the vaults kept', async () => {
    const store = memoryStore();
    const { relay } = relayOver({ store, quotas: store.quotas }, { maxDbBytes: 5 });
    expect((await relay(put(vaultId(0), { body: bytes(1, 2, 3, 4) }))).status).toBe(201);
    expect(await store.quotas.bytes()).toBe(4);
    expect((await relay(put(vaultId(1), { body: bytes(1) }))).status).toBe(201);
    expect((await relay(put(vaultId(2), { body: bytes(1) }))).status).toBe(507);
  });

  it('counts nothing without a quota store (the tests’ relays)', async () => {
    const relay = createRelay({ store: memoryStore(), limits: { newVaultsPerAddress: 0 } });
    expect((await relay(put(vaultId(0), { from: '192.0.2.1' }))).status).toBe(201);
  });
});

/* ------------------------------------------------------------------ */
/* An earlier relay's database                                        */
/* ------------------------------------------------------------------ */

/** The vault table as relays before 0.31.1 made it, with one vault in it. */
const OLD_SCHEMA = [
  `CREATE TABLE vaults (
    id TEXT PRIMARY KEY,
    auth_hash TEXT NOT NULL,
    version INTEGER NOT NULL,
    data TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    touched_at INTEGER NOT NULL
  )`,
  'CREATE INDEX vaults_used ON vaults (touched_at, updated_at)',
];

describe('a database an earlier relay made', () => {
  it('gains the new columns in D1, loses the index on the times, and keeps its vaults', async () => {
    const db = fakeD1();
    for (const sql of OLD_SCHEMA) await db.prepare(sql).run();
    const authHash = await sha256(TOKEN);
    const old = EVENING - 5 * DAY_MS;
    await db
      .prepare(
        'INSERT INTO vaults (id, auth_hash, version, data, updated_at, touched_at) VALUES (?, ?, 7, ?, ?, ?)',
      )
      .bind(vaultId(0), authHash, Buffer.from([1, 2, 3]).toString('base64'), old, old)
      .run();
    // Two isolates open it at once: both see the columns missing, one adds them first.
    const first = d1Store(db);
    const second = d1Store(db);
    const [a, b] = await Promise.all([first.get(vaultId(0)), second.get(vaultId(0))]);
    expect(a).toMatchObject({ version: 7, writesDay: null, writes: 0 });
    expect(b).toEqual(a);
    const names = async (sql: string) =>
      (await db.prepare(sql).all()).results.map((row) => String(row.name));
    expect(await names('PRAGMA table_info(vaults)')).toEqual([
      'id',
      'auth_hash',
      'version',
      'data',
      'updated_at',
      'touched_at',
      'writes_day',
      'writes',
    ]);
    expect(
      await names("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'vaults'"),
    ).not.toContain('vaults_used');
    // Its vault is written as any other, and counted from then on.
    const { relay } = relayOver({ store: first, quotas: first.quotas });
    expect((await relay(put(vaultId(0), { version: 7 }))).status).toBe(200);
    expect(await first.get(vaultId(0))).toMatchObject({
      version: 8,
      writesDay: '2026-10-12',
      writes: 1,
    });
    // A third isolate, later, finds nothing left to do.
    expect(await d1Store(db).get(vaultId(0))).toMatchObject({ version: 8 });
  });

  it('gains the new columns in a SQLite file too, however many processes open it', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'relay-'));
    try {
      const path = join(dir, 'relay.db');
      const old = new DatabaseSync(path);
      old.exec(OLD_SCHEMA.join(';').replace('data TEXT', 'data BLOB'));
      old
        .prepare(
          'INSERT INTO vaults (id, auth_hash, version, data, updated_at, touched_at) VALUES (?, ?, 3, ?, ?, ?)',
        )
        .run(vaultId(0), 'hash', new Uint8Array([1, 2]), EVENING, EVENING);
      old.close();
      const one = sqliteStore(path);
      const two = sqliteStore(path);
      expect(await one.get(vaultId(0))).toMatchObject({ version: 3, writesDay: null, writes: 0 });
      expect(await one.update(vaultId(0), 3, bytes(5), EVENING, 10)).toEqual({
        ok: true,
        version: 4,
      });
      expect(await two.get(vaultId(0))).toMatchObject({
        version: 4,
        writesDay: '2026-10-12',
        writes: 1,
      });
      one.close();
      two.close();
      const check = new DatabaseSync(path);
      const indexes = check
        .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'vaults'")
        .all()
        .map((row) => row.name);
      check.close();
      expect(indexes).not.toContain('vaults_used');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

/* ------------------------------------------------------------------ */
/* Reminders                                                          */
/* ------------------------------------------------------------------ */

const APP = 'https://app.test';
const SUBSCRIPTION = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/device-1',
  expirationTime: null,
  keys: {
    p256dh:
      'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
    auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  },
};
/** A device's reminder token (43 base64url characters), told apart by `n`. */
const deviceToken = (n: number) => `${String(n).padStart(3, '0')}${'d'.repeat(40)}`;

function reminderRequest(n: number, from: string, minute = 18 * 60) {
  return new Request(`${URL_BASE}/v1/push/reminder`, {
    method: 'POST',
    headers: { Origin: APP, 'Content-Type': 'application/json', 'CF-Connecting-IP': from },
    body: JSON.stringify({
      token: deviceToken(n),
      subscription: SUBSCRIPTION,
      minute,
      tz: 'Europe/London',
    }),
  });
}

describe('new reminders', () => {
  it('are kept 5 a day from one address, and changes to those kept are not counted', async () => {
    let clock = EVENING;
    const store = memoryStore();
    const relay = createRelay({
      store,
      allowedOrigins: [APP],
      push: createPushApi({
        store: memoryPushStore(),
        allowedOrigins: [APP],
        quotas: store.quotas,
        now: () => clock,
      }),
    });
    for (let n = 0; n < NEW_REMINDERS_PER_ADDRESS; n++) {
      expect((await relay(reminderRequest(n, '2001:db8:5:6::1'))).status).toBe(201);
    }
    const refused = await relay(reminderRequest(9, '2001:db8:5:6::2'));
    expect(refused.status).toBe(429);
    expect(refused.headers.get('Retry-After')).toBe(String(3 * 3600));
    expect(await refused.json()).toEqual({
      error: 'Too many new reminders from here today: try again tomorrow.',
    });
    expect((await relay(reminderRequest(0, '2001:db8:5:6::1', 9 * 60))).status).toBe(200);
    expect((await relay(reminderRequest(9, '2001:db8:5:7::1'))).status).toBe(201);
    clock += 3 * HOUR;
    expect((await relay(reminderRequest(10, '2001:db8:5:6::1'))).status).toBe(201);
  });

  it('are limited per address on the Worker too, by its setting', async () => {
    const env = { DB: fakeD1(), ALLOWED_ORIGINS: APP, NEW_REMINDERS_PER_ADDRESS: '1' };
    expect((await worker.fetch(reminderRequest(0, '192.0.2.1'), env)).status).toBe(201);
    expect((await worker.fetch(reminderRequest(1, '192.0.2.1'), env)).status).toBe(429);
    expect((await worker.fetch(reminderRequest(2, '192.0.2.2'), env)).status).toBe(201);
  });
});

/* ------------------------------------------------------------------ */
/* The Worker and the Node server                                     */
/* ------------------------------------------------------------------ */

/** Every value in every row of every table in a D1 stand-in, as text. */
async function everything(db: ReturnType<typeof fakeD1>) {
  const { results: tables } = await db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
    .all();
  const rows: Record<string, unknown[]> = {};
  for (const table of tables) {
    const name = String(table.name);
    rows[name] = (await db.prepare(`SELECT * FROM "${name}"`).all()).results;
  }
  return rows;
}

describe('a secret for the counts', () => {
  const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');
  const hmac = (secret: string, text: string) =>
    createHmac('sha256', secret).update(text).digest('hex');

  it('hashes with SHA-256 alone, or with an HMAC under the secret', async () => {
    expect(await keyedHash('salt|192.0.2.1')).toBe(sha256('salt|192.0.2.1'));
    expect(await keyedHash('salt|192.0.2.1', 'S3cret')).toBe(hmac('S3cret', 'salt|192.0.2.1'));
    expect(await keyedHash('salt|192.0.2.1', 'other')).not.toBe(hmac('S3cret', 'salt|192.0.2.1'));
  });

  it('leaves the store as it is without one', () => {
    const store = memoryStore();
    expect(withSecret(store.quotas, undefined)).toBe(store.quotas);
    expect(withSecret(store.quotas, '')).toBe(store.quotas);
    expect(withSecret(store.quotas, 'S3cret').secret).toBe('S3cret');
  });

  it('keys the Worker’s counts by HMACs under QUOTA_SECRET, and still counts by address', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(EVENING);
    const db = fakeD1();
    const env = { DB: db, QUOTA_SECRET: 'S3cret', NEW_VAULTS_PER_ADDRESS: '1' };
    expect((await worker.fetch(put(vaultId(0), { from: '192.0.2.1' }), env)).status).toBe(201);
    expect((await worker.fetch(put(vaultId(1), { from: '192.0.2.1' }), env)).status).toBe(429);
    expect((await worker.fetch(put(vaultId(2), { from: '192.0.2.2' }), env)).status).toBe(201);
    const day = utcDay(EVENING);
    const salt = (await db
      .prepare('SELECT value FROM relay_meta WHERE name = ?')
      .bind(saltName(day))
      .first()) as { value: string } | null;
    const { results } = (await db
      .prepare("SELECT key FROM quotas WHERE kind = 'vault' AND key != ?")
      .bind(EVERYONE)
      .all()) as { results: { key?: unknown }[] };
    const keys = results.map((r) => String(r.key)).sort();
    const value = salt?.value ?? '';
    expect(keys).toEqual(
      [hmac('S3cret', `${value}|192.0.2.1`), hmac('S3cret', `${value}|192.0.2.2`)].sort(),
    );
    expect(keys).not.toContain(sha256(`${value}|192.0.2.1`));
    vi.useRealTimers();
  });
});

describe('the Worker’s limits', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const cron = async (env: Record<string, unknown>) => {
    const waits: Promise<unknown>[] = [];
    worker.scheduled({ cron: DAILY_CRON }, env, { waitUntil: (p) => waits.push(p) });
    await Promise.all(waits);
  };

  it('come from its variables, a typo leaving the default', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(EVENING);
    const env = { DB: fakeD1(), NEW_VAULTS_PER_ADDRESS: '1', NEW_VAULTS_PER_DAY: 'lots' };
    expect((await worker.fetch(put(vaultId(0), { from: '192.0.2.1' }), env)).status).toBe(201);
    expect((await worker.fetch(put(vaultId(1), { from: '192.0.2.1' }), env)).status).toBe(429);
    expect((await worker.fetch(put(vaultId(2), { from: '192.0.2.2' }), env)).status).toBe(201);
    const writes = { DB: fakeD1(), VAULT_WRITES_PER_DAY: '1' };
    expect((await worker.fetch(put(vaultId(0)), writes)).status).toBe(201);
    vi.setSystemTime(EVENING + 2_000);
    expect((await worker.fetch(put(vaultId(0), { version: 1 }), writes)).status).toBe(429);
    vi.setSystemTime(EVENING + 3 * HOUR);
    expect((await worker.fetch(put(vaultId(0), { version: 1 }), writes)).status).toBe(200);
  });

  it('give the optional binding an IPv6 address by its /64', async () => {
    const keys: string[] = [];
    const env = {
      DB: fakeD1(),
      NEW_VAULTS: {
        limit: ({ key }: { key: string }) => {
          keys.push(key);
          return Promise.resolve({ success: true });
        },
      },
    };
    await worker.fetch(put(vaultId(0), { from: '2001:db8:1:2:3:4:5:6' }), env);
    expect(keys).toEqual(['2001:db8:1:2::/64']);
  });

  it('are counted under salted hashes: no address is stored, and the daily cron clears them', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(EVENING);
    const db = fakeD1();
    const env = { DB: db, ALLOWED_ORIGINS: APP };
    const addresses = ['203.0.113.77', '2001:db8:77:1::5'];
    for (const [n, from] of addresses.entries()) {
      expect((await worker.fetch(put(vaultId(n), { from }), env)).status).toBe(201);
      expect((await worker.fetch(reminderRequest(n, from), env)).status).toBe(201);
    }
    const stored = JSON.stringify(await everything(db));
    for (const text of [...addresses, '2001:db8:77:1', '/64', '203.0.113']) {
      expect(stored).not.toContain(text);
    }
    // Per address, a count of new vaults and one of new reminders; and the day's new vaults.
    const before = await everything(db);
    expect(before.quotas).toHaveLength(2 * 2 + 1);
    const salts = (rows: unknown[] | undefined) =>
      (rows ?? []) as { name: string; value: string }[];
    expect(salts(before.relay_meta).map((row) => row.name)).toEqual(['salt:2026-10-12']);
    const salt = salts(before.relay_meta)[0]?.value ?? '';
    expect(salt).toMatch(/^[0-9a-f]{64}$/);
    // The keys are the hashes of the day's salt and each address (an IPv6 one by its /64).
    const keys = (before.quotas as { key: string }[]).map((row) => row.key);
    expect(keys).toContain(await sha256(`${salt}|203.0.113.77`));
    expect(keys).toContain(await sha256(`${salt}|2001:db8:77:1::/64`));
    expect(keys).toContain('*');

    // A day on, the cron keeps yesterday's; two days on, it clears them.
    vi.setSystemTime(EVENING + DAY_MS);
    await cron(env);
    expect((await everything(db)).quotas).toHaveLength(5);
    expect((await worker.fetch(put(vaultId(5), { from: addresses[0] }), env)).status).toBe(201);
    vi.setSystemTime(EVENING + 2 * DAY_MS);
    await cron(env);
    const after = await everything(db);
    expect(after.quotas).toEqual([
      expect.objectContaining({ day: '2026-10-13' }),
      expect.objectContaining({ day: '2026-10-13' }),
    ]);
    expect(salts(after.relay_meta).map((row) => row.name)).toEqual(['salt:2026-10-13']);
    expect(salts(after.relay_meta)[0]?.value).not.toBe(salt);
  });

  it('count a day’s new vaults across the relay in D1', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(EVENING);
    const env = { DB: fakeD1(), NEW_VAULTS_PER_DAY: '2' };
    expect((await worker.fetch(put(vaultId(0), { from: '192.0.2.1' }), env)).status).toBe(201);
    expect((await worker.fetch(put(vaultId(1), { from: '192.0.2.2' }), env)).status).toBe(201);
    const refused = await worker.fetch(put(vaultId(2), { from: '192.0.2.3' }), env);
    expect(refused.status).toBe(503);
    expect(refused.headers.get('Retry-After')).toBe(String(secondsToMidnight(EVENING)));
  });
});

describe('the Node server’s limits', () => {
  it('count the client’s address as Cloudflare’s do: an IPv6 address by its /64', async () => {
    const store = memoryStore();
    const relay = createRelay({
      store,
      quotas: store.quotas,
      limits: { newVaultsPerAddress: 1 },
    });
    const server = nodeServer(relay).listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    const { port } = server.address() as AddressInfo;
    try {
      // From a proxy on this machine, which adds the client's address last.
      const create = (n: number, client: string) =>
        fetch(`http://127.0.0.1:${port}/v1/vaults/${vaultId(n)}`, {
          method: 'PUT',
          body: bytes(1),
          headers: {
            Authorization: `Bearer ${n % 2 ? OTHER_TOKEN : TOKEN}`,
            'If-None-Match': '*',
            'X-Forwarded-For': client,
          },
        });
      expect((await create(0, '2001:db8:9:9::1')).status).toBe(201);
      expect((await create(1, '2001:db8:9:9:abcd::2')).status).toBe(429);
      expect((await create(2, '2001:db8:9:a::1')).status).toBe(201);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
