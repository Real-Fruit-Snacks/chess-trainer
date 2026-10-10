package main

import (
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// app writes a small app folder (and a secret beside it, which must never be served).
func app(t *testing.T) string {
	t.Helper()
	parent := t.TempDir()
	dir := filepath.Join(parent, "app")
	files := map[string]string{
		"index.html":                "<title>shell</title>",
		"404.html":                  "<title>shell (404)</title>",
		"assets/index-abc.js":       "export {};",
		"assets/index-abc.css":      "body{}",
		"engine/stockfish.wasm":     "\x00asm",
		"maia/model.onnx":           "onnx",
		"manifest.webmanifest":      "{}",
		"puzzles/index.json":        "[]",
		"icons/icon.png":            "png",
		"docs/index.html":           "<title>docs</title>",
		"boards/wood.jpg":           "jpg",
		"notices.txt":               "notices",
		"screenshots/wide.webp":     "webp",
		"assets/empty-folder/.keep": "",
	}
	for name, body := range files {
		path := filepath.Join(dir, filepath.FromSlash(name))
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, []byte(body), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.WriteFile(filepath.Join(parent, "secret.txt"), []byte("secret"), 0o644); err != nil {
		t.Fatal(err)
	}
	return dir
}

func get(t *testing.T, h http.Handler, method, target string, header ...string) *http.Response {
	t.Helper()
	req := httptest.NewRequest(method, target, nil)
	for i := 0; i+1 < len(header); i += 2 {
		req.Header.Set(header[i], header[i+1])
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec.Result()
}

func body(t *testing.T, resp *http.Response) string {
	t.Helper()
	b, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}

func TestServesTheAppLikeGitHubPages(t *testing.T) {
	h := newHandler(app(t), "1.2.3")

	home := get(t, h, http.MethodGet, "/")
	if home.StatusCode != http.StatusOK || body(t, home) != "<title>shell</title>" {
		t.Fatalf("/ = %d", home.StatusCode)
	}
	if got := home.Header.Get("Content-Type"); got != "text/html; charset=utf-8" {
		t.Errorf("/ Content-Type = %q", got)
	}

	// A deep link: the app's 404 page (a copy of the app, which shows the route), with a 404.
	deep := get(t, h, http.MethodGet, "/learn/basic-checkmates")
	if deep.StatusCode != http.StatusNotFound || body(t, deep) != "<title>shell (404)</title>" {
		t.Errorf("deep link = %d", deep.StatusCode)
	}
	if got := deep.Header.Get("Content-Type"); got != "text/html; charset=utf-8" {
		t.Errorf("deep link Content-Type = %q", got)
	}

	// A folder with an index.html: redirected to its slash, then served.
	folder := get(t, h, http.MethodGet, "/docs")
	if folder.StatusCode != http.StatusMovedPermanently || folder.Header.Get("Location") != "/docs/" {
		t.Errorf("/docs = %d to %q", folder.StatusCode, folder.Header.Get("Location"))
	}
	if docs := get(t, h, http.MethodGet, "/docs/"); body(t, docs) != "<title>docs</title>" {
		t.Errorf("/docs/ = %d", docs.StatusCode)
	}
	// A folder without one is like any unknown path.
	if assets := get(t, h, http.MethodGet, "/assets/"); assets.StatusCode != http.StatusNotFound {
		t.Errorf("/assets/ = %d", assets.StatusCode)
	}
}

func TestServesEachFileWithItsType(t *testing.T) {
	h := newHandler(app(t), "1.2.3")
	for target, want := range map[string]string{
		"/assets/index-abc.js":   "text/javascript; charset=utf-8",
		"/assets/index-abc.css":  "text/css; charset=utf-8",
		"/engine/stockfish.wasm": "application/wasm",
		"/maia/model.onnx":       "application/octet-stream",
		"/manifest.webmanifest":  "application/manifest+json; charset=utf-8",
		"/puzzles/index.json":    "application/json; charset=utf-8",
		"/icons/icon.png":        "image/png",
		"/boards/wood.jpg":       "image/jpeg",
		"/screenshots/wide.webp": "image/webp",
		"/notices.txt":           "text/plain; charset=utf-8",
	} {
		resp := get(t, h, http.MethodGet, target)
		if resp.StatusCode != http.StatusOK {
			t.Errorf("%s = %d", target, resp.StatusCode)
		}
		if got := resp.Header.Get("Content-Type"); got != want {
			t.Errorf("%s Content-Type = %q, want %q", target, got, want)
		}
	}
	if got := contentType("UPPER.JS"); got != "text/javascript; charset=utf-8" {
		t.Errorf("an upper-case extension = %q", got)
	}
	if got := contentType("unknown.xyz"); got != "application/octet-stream" {
		t.Errorf("an unknown extension = %q", got)
	}
}

func TestIsolatesAndRevalidatesEveryResponse(t *testing.T) {
	h := newHandler(app(t), "1.2.3")
	for _, target := range []string{"/", "/assets/index-abc.js", "/learn/x"} {
		resp := get(t, h, http.MethodGet, target)
		for header, want := range map[string]string{
			"Cross-Origin-Opener-Policy":   "same-origin",
			"Cross-Origin-Embedder-Policy": "require-corp",
			"X-Content-Type-Options":       "nosniff",
			"Cache-Control":                "no-cache",
		} {
			if got := resp.Header.Get(header); got != want {
				t.Errorf("%s %s = %q, want %q", target, header, got, want)
			}
		}
	}
	if got := get(t, h, http.MethodGet, "/").Header.Get("Content-Security-Policy"); got != "frame-ancestors 'none'" {
		t.Errorf("the page's Content-Security-Policy = %q", got)
	}
	if got := get(t, h, http.MethodGet, "/assets/index-abc.js").Header.Get("Content-Security-Policy"); got != "" {
		t.Errorf("a script's Content-Security-Policy = %q", got)
	}
}

func TestNeverServesOutsideTheAppFolder(t *testing.T) {
	h := newHandler(app(t), "1.2.3")
	for _, target := range []string{
		"/../secret.txt",
		"/..%2fsecret.txt",
		"/%2e%2e/secret.txt",
		"/assets/../../secret.txt",
		"/..\\secret.txt",
		"/C:/Windows/win.ini",
	} {
		resp := get(t, h, http.MethodGet, target)
		if text := body(t, resp); strings.Contains(text, "secret") {
			t.Errorf("%s served the secret beside the app folder", target)
		}
	}
}

func TestAnswersHeadRangesAndRevalidation(t *testing.T) {
	h := newHandler(app(t), "1.2.3")

	head := get(t, h, http.MethodHead, "/engine/stockfish.wasm")
	if head.StatusCode != http.StatusOK || head.Header.Get("Content-Length") != "4" || body(t, head) != "" {
		t.Errorf("HEAD = %d, length %q", head.StatusCode, head.Header.Get("Content-Length"))
	}
	headMissing := get(t, h, http.MethodHead, "/nowhere")
	if headMissing.StatusCode != http.StatusNotFound || body(t, headMissing) != "" {
		t.Errorf("HEAD of a deep link = %d", headMissing.StatusCode)
	}

	part := get(t, h, http.MethodGet, "/engine/stockfish.wasm", "Range", "bytes=1-2")
	if part.StatusCode != http.StatusPartialContent || body(t, part) != "as" {
		t.Errorf("a range = %d", part.StatusCode)
	}

	modified := get(t, h, http.MethodGet, "/assets/index-abc.js").Header.Get("Last-Modified")
	if modified == "" {
		t.Fatal("no Last-Modified")
	}
	same := get(t, h, http.MethodGet, "/assets/index-abc.js", "If-Modified-Since", modified)
	if same.StatusCode != http.StatusNotModified {
		t.Errorf("revalidation = %d", same.StatusCode)
	}
}

func TestAnswersOnlyReads(t *testing.T) {
	h := newHandler(app(t), "1.2.3")
	resp := get(t, h, http.MethodPost, "/")
	if resp.StatusCode != http.StatusMethodNotAllowed || resp.Header.Get("Allow") != "GET, HEAD" {
		t.Errorf("POST = %d, Allow %q", resp.StatusCode, resp.Header.Get("Allow"))
	}
}

func TestSaysWhatItIs(t *testing.T) {
	h := newHandler(app(t), "1.2.3")
	resp := get(t, h, http.MethodGet, PingPath)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("ping = %d", resp.StatusCode)
	}
	if got := body(t, resp); got != "{\"app\":\"chess-trainer\",\"version\":\"1.2.3\"}\n" {
		t.Errorf("ping = %q", got)
	}
}

func TestWithoutA404PageSaysNotFound(t *testing.T) {
	dir := app(t)
	if err := os.Remove(filepath.Join(dir, "404.html")); err != nil {
		t.Fatal(err)
	}
	resp := get(t, newHandler(dir, "1.2.3"), http.MethodGet, "/learn/x")
	if resp.StatusCode != http.StatusNotFound || !strings.Contains(body(t, resp), "Not found") {
		t.Errorf("deep link without 404.html = %d", resp.StatusCode)
	}
}
