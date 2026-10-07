# Device-sync relay

A tiny service that lets Chess Trainer keep a learner's data in step across
their devices without accounts. Each learner's data is one encrypted file, a
**vault**, which only their devices can open. The relay stores those files and
cannot read them.

The relay deploys to Cloudflare Workers with a D1 database, which the free plan
covers. The same code also runs as a plain Node server for hosting it yourself.

## What the relay sees

The app makes a 12-word recovery phrase from 128 random bits. From those bits,
HKDF-SHA-256 derives three values on the device:

| Value          | Where it goes                                                |
| -------------- | ------------------------------------------------------------ |
| vault id       | the vault's name on the relay                                |
| write token    | sent with every request; the relay keeps only its SHA-256    |
| encryption key | never leaves the device (AES-256-GCM, bound to the vault id) |

So for each vault the relay holds:

- a random-looking name;
- the encrypted, compressed data;
- a version number;
- when the vault was last written and last read;
- the hash of its token.

There are no accounts, emails or device names. The relay writes no logs, and
the Worker's observability is off. Like any web server, Cloudflare (or your
own host) sees the IP address of each request. A vault that nobody writes or
reads for a year is deleted.

The data is a backup file, sealed:

- the header `CTS1`;
- a random 12-byte nonce;
- the AES-GCM ciphertext of the gzipped JSON.

A relay that alters a vault, or swaps one vault for another, is caught when
the app opens it. Each write also seals a generation number, one more than the
last. A device refuses a copy older than one it has already seen, so a relay
cannot roll the data back either. Sealed with them is each device's latest
write, under a random id the device makes for itself: a device whose write's
answer was lost learns from the next read whether it went through. The relay
sees none of it. See `src/lib/sync/vaultCrypto.ts` and
`src/lib/sync/deviceSync.ts`.

## API

| Request                 | Answers                                                                                                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /v1/health`        | `200 {"ok":true,"maxBytes":…}`                                                                                                                                           |
| `GET /v1/vaults/:id`    | `200` the bytes with `ETag: "<version>"`; `204` (no body) when `X-Known-Version` names the current version; `404`                                                        |
| `PUT /v1/vaults/:id`    | `201` created (`If-None-Match: *`); `200` replaced (`If-Match: "<version>"`); `412` changed meanwhile (its `ETag` is the current version); `413` too big; `429` too soon |
| `DELETE /v1/vaults/:id` | `204`                                                                                                                                                                    |

Notes:

- Every vault request needs `Authorization: Bearer <token>`. A wrong token
  gets `403`, and a missing one gets `401`.
- Ids and tokens are 32 bytes in unpadded base64url (43 characters).
- A vault holds at most 1,400,000 bytes.
- A vault can be replaced at most once a second.
- Writes go by version, so two devices writing at once never overwrite each
  other. The second write gets `412`, and that device merges and writes again.

## Deploy on Cloudflare

You need a Cloudflare account; the free plan is enough. On the first deploy,
Wrangler may ask you to pick a `workers.dev` subdomain for your account, and to
create the D1 database (Wrangler 4.45 or later does that itself). It then writes
the database's id back into `wrangler.jsonc`: commit that change.

```sh
cd relay
npx wrangler@latest login
npx wrangler@latest deploy
```

From the repository root, `npm run relay:deploy` runs the same deploy.

Wrangler prints the Worker's address, `https://chess-trainer-sync.<your-subdomain>.workers.dev`.
Put it in `syncRelay` in `src/site.config.ts`, and put the app's origin in
`ALLOWED_ORIGINS` in `wrangler.jsonc`. Pages on other origins then cannot read
the relay's answers. The page's Content Security Policy takes the relay's origin
from `syncRelay` at build time.

Settings in `wrangler.jsonc` (`vars`):

| Variable          | Meaning                                                    |
| ----------------- | ---------------------------------------------------------- |
| `ALLOWED_ORIGINS` | the app's origins, comma-separated (`*` allows any origin) |
| `MAX_BYTES`       | the largest vault accepted (at most 1,400,000 on D1)       |

A cron runs once a day and deletes vaults unused for a year.

The Worker turns on the `nodejs_compat` flag for Node's `Buffer`. D1 keeps a
vault as base64 text, and native base64 turns a full vault around in about
2 ms, well inside the free plan's 10 ms of CPU per request.

The free plan allows 100,000 requests a day, and D1 100,000 written rows. A
device makes a request when the app opens, a few seconds after each change, and
every 5 minutes while the app is on screen, so a device in use all day makes a
few hundred. If the relay outgrows the free plan, devices see a "could not be
reached" or server error and try again later; Workers Paid lifts the limits.

To check it works:

```sh
curl https://chess-trainer-sync.<your-subdomain>.workers.dev/v1/health
```

### Optional: fewer new vaults per address

Anyone can make vaults, since there are no accounts, and a script could fill the
database with them. To limit how many vaults each address can create, add a
rate-limiting binding called `NEW_VAULTS` to `wrangler.jsonc`, then deploy again:

```jsonc
"ratelimits": [
  { "name": "NEW_VAULTS", "namespace_id": "1001", "simple": { "limit": 10, "period": 60 } }
]
```

Each address may then create 10 vaults a minute (Wrangler 4.36 or later reads
the binding). Reading and writing existing vaults is not limited, and Cloudflare
counts at each of its locations separately. Cloudflare does not say which plans
include the binding, so it is not in the default config.

## Host it yourself

The Node server keeps vaults in a SQLite file (`node:sqlite`, Node 22.22 or
later). It needs no dependencies.

```sh
node relay/src/server.mjs --port 8787 --db relay.db --origin https://you.github.io
```

| Option        | Default     | Meaning                                              |
| ------------- | ----------- | ---------------------------------------------------- |
| `--host`      | `127.0.0.1` | the address to listen on                             |
| `--port`      | `8787`      |                                                      |
| `--db`        | `relay.db`  | the SQLite file (`:memory:` keeps nothing)           |
| `--origin`    | any         | the app's origin; repeat it, or separate with commas |
| `--max-bytes` | 1,400,000   | the largest vault accepted                           |

A request body is kept only up to the vault limit, and the rest is dropped as it
arrives, so an endless upload cannot fill the memory.

Put it behind HTTPS (a reverse proxy such as Caddy or nginx). An app served over
HTTPS can only reach an HTTPS relay; `localhost` is the one exception. Then
set `syncRelay` in `src/site.config.ts` to its address.

To try the app against a local relay while developing:

1. Run `npm run relay:dev` (an in-memory relay on port 8787).
2. Set `syncRelay` to `http://localhost:8787`.

## Turning sync off for a fork

Set `syncRelay` to an empty string. Settings then does not offer device sync,
and the page's Content Security Policy names no relay.

## Code

| File                  | What it is                                                      |
| --------------------- | --------------------------------------------------------------- |
| `src/handler.mjs`     | the HTTP API as a Fetch API handler, over any vault store       |
| `src/worker.mjs`      | the Cloudflare Worker: the handler over D1, plus the daily cron |
| `src/d1Store.mjs`     | vaults in D1 (base64 text, so a vault fits D1's 2 MB row)       |
| `src/server.mjs`      | the Node server                                                 |
| `src/sqliteStore.mjs` | vaults in a SQLite file                                         |
| `src/memoryStore.mjs` | vaults in memory (tests and `relay:dev`)                        |
| `src/*.d.mts`         | types for TypeScript callers (the tests)                        |
| `relay.test.ts`       | the tests (`npx vitest run relay`)                              |
