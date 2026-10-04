# Deployment

## GitHub Pages (recommended)

1. Push the repository to GitHub.
2. Open **Settings → Pages** and set **Build and deployment → Source** to **GitHub Actions**.
3. Push to `main` (the site deploys once CI has passed), or trigger **Deploy to GitHub Pages** from
   the Actions tab.

The workflow (`.github/workflows/deploy.yml`) runs when the **CI** workflow completes successfully on
a push to `main`, and on demand. It:

- checks out exactly the commit CI tested,
- installs dependencies with `npm ci --ignore-scripts` (no package runs an install script), then
  downloads and checksum-verifies the engine,
- builds with `VITE_BASE_PATH` taken from `actions/configure-pages` — `/` for `user.github.io`
  repositories, `/<repo>/` for project sites,
- keeps the build's source maps as a workflow artifact (`sourcemaps-<commit>`, 90 days) — they are
  never deployed,
- uploads `dist/` and deploys it with `actions/deploy-pages`.

Every action in the workflows is pinned to a commit SHA, with its version in a comment; Dependabot
moves the pins. First deploys can take a minute to propagate. The site URL is shown on the workflow's
summary page.

On a `user.github.io` repository the app owns the whole origin: its service worker is registered at
the root scope and Pages serves its `404.html` for every unknown path. The worker only answers
navigations to the app's own routes (`src/sw/appRoutes.ts`), so another project published under the
same user page keeps working — but `404.html` will still show this app's "not found" page for a path
no project owns. Prefer a project site (`/<repo>/`) when the origin hosts more than one site. CI
builds and tests the app under `/chess-trainer/` too, behind a server that answers like Pages
(`npm run preview:pages -- --base /chess-trainer/` does the same locally after a build with that
`VITE_BASE_PATH`).

### Custom domain

Add a `public/CNAME` file containing your domain, then configure the domain under **Settings → Pages**.
Because the base path becomes `/`, nothing else changes.

### Updating

Every push to `main` that passes CI redeploys. Builds are reproducible: the build date the app shows
is the commit's date (or `SOURCE_DATE_EPOCH`), so redeploying an unchanged commit produces identical
files and no update for anyone. Returning visitors keep the cached version for the moment: the app
looks for a newer build on load, every hour, and whenever it is brought back into view, and once one
is ready it shows a "A new version is ready" toast with a **Reload now** button and otherwise loads
the new version at the visitor's next in-app navigation.

### Releases

Bump `version` in `package.json` and add the version's `CHANGELOG.md` section, then push a matching
tag (`git tag v0.12.0 && git push origin v0.12.0`). The **Release** workflow refuses a tag that does
not match `package.json`, and otherwise publishes a GitHub release for the tag with that section as
the notes and a link to the live app (the `siteUrl` in `src/site.config.ts`).

### Crash reports

A crash report (the error page's "Copy details" or its pre-filled issue) names the version, the build
date and the commit. The stack is minified; download the `sourcemaps-<commit>` artifact from that
commit's deploy run to read it.

### Renaming and branding

Everything user-visible lives in [`src/site.config.ts`](../src/site.config.ts): the name, tagline,
site and repository URLs and theme colours (the release notes read the site URL from there too).
Replace `scripts/icons/logo.svg` and run `npm run icons:generate` for new icons (and
`npm run screenshots` against a preview of the new build for the install dialog), then update the badge
URLs at the top of `README.md` and the links in `.github/ISSUE_TEMPLATE/config.yml`.

## Other static hosts

Any static host works (Netlify, Cloudflare Pages, Vercel, S3 + CloudFront, nginx):

```bash
VITE_BASE_PATH=/ npm run build
# upload dist/ (sourcemaps/ stays behind)
```

Requirements:

- Serve `index.html` for unknown paths (SPA fallback) **or** rely on the generated `404.html`.
- Serve `.wasm` with `Content-Type: application/wasm` (all mainstream hosts do).
- Keep `licence.txt` and `notices.txt` next to `index.html`: every page links to them.

Optional headers:

- `Content-Security-Policy: frame-ancestors 'none'` — the one directive the page's own policy (a meta
  tag in `index.html`) cannot set. The service worker adds it to the pages it serves, but a host
  header also covers the very first visit.
- Not needed for the multi-threaded engine: when the learner turns it on in Settings, the service
  worker adds the `Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy` headers itself (see
  `src/sw/isolation.ts`). A host that sends them on every response makes the app cross-origin isolated
  for everyone, which also blocks cross-origin resources that are not CORS-enabled.

## Environment variables

| Variable            | Default         | Purpose                                                                        |
| ------------------- | --------------- | ------------------------------------------------------------------------------ |
| `VITE_BASE_PATH`    | `/`             | URL prefix the site is served from (the end-to-end tests follow it too).       |
| `SOURCE_DATE_EPOCH` | the commit date | Build date in seconds since 1970, for reproducible builds outside git.         |
| `ALL_BROWSERS`      | unset           | `1` runs the Firefox and WebKit projects in a local `npm run e2e`, as CI does. |

## Checking a deployment

- Open the site, then go offline (DevTools → Network → Offline) and reload: it should still work,
  including Play and Analyze.
- Chrome DevTools → Application → Manifest: no warnings; "Add to home screen" available.
- The console shows no Content-Security-Policy violations, and the footer's Licence and Third-party
  notices links open `licence.txt` and `notices.txt`.
- `npm run lighthouse` against a preview of the same build passes its accessibility, best-practices
  and SEO floors (Lighthouse no longer has a PWA category).
