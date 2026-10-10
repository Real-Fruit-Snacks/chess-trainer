# The offline copy's launcher

A small Go program, with nothing beyond Go's standard library, that every release's offline copy
carries (`chess-trainer-<version>-offline.zip`; see
[docs/DEPLOYMENT.md](../docs/DEPLOYMENT.md#the-offline-copy)). It serves the copy's `app/` folder on
the computer itself and opens it in the browser:

- at `http://localhost:8064/`, always the same address, because the browser keeps the app's data
  (progress, settings) per address; when another program holds 8064 it takes the next free port up
  to 8073 and says so;
- on the loopback addresses only (127.0.0.1, and ::1 when the computer has it): no other computer
  can reach it;
- the way GitHub Pages serves the live site: a file as it is, with its type from the launcher's own
  table (never the system's: Windows' registry can call `.js` `text/plain`), a folder by its
  `index.html`, and any other path with `404.html` (a copy of the app) and a 404;
- with `Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy` on every response, so even
  the first visit can run the threaded engine, `Cache-Control: no-cache` (the app's service worker
  keeps the app offline), and `frame-ancestors 'none'` on pages;
- answering `GET /__chess-trainer/launcher` with its name and version: a second start finds the
  running one there and opens it (or, for another version, asks for that one to be closed first).

```text
chess-trainer [-port N] [-app DIR] [-no-browser] [-version]
```

On Windows a double-click gives the launcher a console window of its own; when it stops with an
error, it waits for Enter so the message can be read.

## Files

- `main.go`: flags, finding the app folder (beside the launcher, or beside `bin/`), the messages,
  serving until Ctrl+C or the window closes.
- `listen.go`: taking the port (or finding a launcher already there).
- `server.go`: the handler.
- `browser.go`: opening the default browser.
- `console_*.go`: whether the launcher has its console window to itself (Windows).
- `bundle/`: what the copy carries besides the app and the launchers: the macOS and Linux start
  scripts (they pick the launcher for the processor), the README and the launchers' licence notice,
  filled in by `scripts/package-offline.mjs`.

## Working on it

```bash
cd launcher
gofmt -l .        # prints nothing when formatted
go vet ./...
go test ./...     # starts real servers on free ports
```

`npm run release:offline` (from the repository root, after `npm run build`) builds the five
launchers into the copy with the version from `package.json`; `npm run e2e:offline` then tries the
copy in Chromium through the launcher for this computer. CI runs all of these on every change.
