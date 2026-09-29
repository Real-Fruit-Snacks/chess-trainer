# Deployment

## GitHub Pages (recommended)

1. Push the repository to GitHub.
2. Open **Settings → Pages** and set **Build and deployment → Source** to **GitHub Actions**.
3. Push to `main`, or trigger **Deploy to GitHub Pages** from the Actions tab.

The workflow (`.github/workflows/deploy.yml`):

- installs dependencies with `npm ci`,
- downloads and checksum-verifies the engine (`prebuild` hook),
- builds with `VITE_BASE_PATH` taken from `actions/configure-pages` — `/` for `user.github.io`
  repositories, `/<repo>/` for project sites,
- uploads `dist/` and deploys it with `actions/deploy-pages`.

First deploys can take a minute to propagate. The site URL is shown on the workflow's summary page.

### Custom domain

Add a `public/CNAME` file containing your domain, then configure the domain under **Settings → Pages**.
Because the base path becomes `/`, nothing else changes.

### Updating

Every push to `main` redeploys. Returning visitors keep using the cached version until they reload;
the app shows a "New version available — Reload" toast as soon as the new service worker is ready.

## Other static hosts

Any static host works (Netlify, Cloudflare Pages, Vercel, S3 + CloudFront, nginx):

```bash
VITE_BASE_PATH=/ npm run build
# upload dist/
```

Requirements:

- Serve `index.html` for unknown paths (SPA fallback) **or** rely on the generated `404.html`.
- Serve `.wasm` with `Content-Type: application/wasm` (all mainstream hosts do).
- Optional: add `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`
  headers if you want to switch to the multi-threaded engine build later (see `scripts/setup-engine.mjs`).

## Environment variables

| Variable         | Default | Purpose                             |
| ---------------- | ------- | ----------------------------------- |
| `VITE_BASE_PATH` | `/`     | URL prefix the site is served from. |

## Checking a deployment

- Open the site, then go offline (DevTools → Network → Offline) and reload: it should still work,
  including Play and Analyze.
- Chrome DevTools → Application → Manifest: no warnings; "Add to home screen" available.
- Lighthouse PWA/Best practices audits should pass.
